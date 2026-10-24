"use client";
// After the reveal round (runs by itself): open the public copy of every set and every centre's tlocked r_c,
// check the commitments, show the draw.
import { commitRc, drawSet, offlineClient, openRc, openText, parseExamSet, type ExamSet } from "@sealhour/seal";
import { toUtf8String } from "ethers";
import { useEffect, useRef } from "react";
import { useConfig } from "../Providers";
import { fetchRoundSignature, roundTimeMs, type BeaconState } from "@/lib/beacon";
import { explainError, isTransient, retryTransient } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { fetchPublicCopy } from "@/lib/packages";
import { burnedIndexes, centreName, readSnapshot, setLabel, submittedIndexes, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { DrawResult, VerifyDetails } from "../blocks";
import { Chip, ErrorBox, Hex } from "../ui";

export interface RevealData {
  /** openTimeMs: the reserve's own opening time (regular sets use the main opening time). */
  sets: { setIndex: number; set: ExamSet; openTimeMs?: number }[];
  setErrors: { setIndex: number; message: string }[];
  centres: { centreId: string; rcHex: string | null; ok: boolean; message?: string }[];
  signatureHex: string;
  drawnSet: number;
  burned: number[];
}

export function RevealPanel(props: { snap: ExamSnapshot; b: BeaconState; data: RevealData | null; onData: (d: RevealData) => void }) {
  const { snap, b, data, onData } = props;
  const cfg = useConfig();
  const { t } = useI18n();
  const act = useAction<RevealData>();
  const revealed = b.round >= snap.exam.revealRound;
  // The local clock can be ahead of the relay: wait until the relay serves the reveal round.
  const served = b.relayRound !== null && b.relayRound >= snap.exam.revealRound;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One pass; a transient failure (round not served yet, network) anywhere aborts the pass, so a partial
  // result is never shown as final: retryTransient runs it again.
  const once = async (): Promise<RevealData> => {
    if (!b.info) throw new Error(t("centre.noInfo"));
    // Fresh snapshot: a set burned after the page was opened must be skipped by the draw.
    const snap = await readSnapshot(cfg, props.snap.examId);
    const signatureHex = await fetchRoundSignature(b.client, snap.exam.openRound);
    offlineClient(b.info, snap.exam.openRound, signatureHex); // throws if the signature does not verify
    const burned = burnedIndexes(snap);
    const drawnSet = drawSet(signatureHex, snap.exam.setCount, burned, submittedIndexes(snap));
    const sets: RevealData["sets"] = [];
    const setErrors: RevealData["setErrors"] = [];
    for (const p of snap.packages) {
      const isReserve = p.setIndex === snap.exam.setCount;
      try {
        if (!p.submitted) throw new Error(t("public.notPublished"));
        const text = await openText({ tlocked: await fetchPublicCopy(cfg, p.uri), client: b.client });
        // The reserve opens at its own round: a reserve leak before it points to the reserve committee.
        const openTimeMs = isReserve ? roundTimeMs(cfg, b.info, snap.exam.reserveOpenRound) : undefined;
        sets.push({ setIndex: p.setIndex, set: parseExamSet(text), ...(isReserve ? { openTimeMs } : {}) });
      } catch (e) {
        // The reserve public copy opens only at the reserve reveal round: not an error before it.
        if (isReserve && b.round < snap.exam.reserveRevealRound) continue;
        if (isTransient(e)) throw e;
        setErrors.push({ setIndex: p.setIndex, message: explainError(e, t, cfg) });
      }
    }
    const centres: RevealData["centres"] = [];
    for (const part of snap.participations) {
      if (!part.joined) {
        centres.push({ centreId: part.centreId, rcHex: null, ok: false, message: t("public.notJoined") });
        continue;
      }
      try {
        const rcHex = await openRc({ tlocked: toUtf8String(part.tlockedRc), client: b.client });
        const ok = commitRc(rcHex).toLowerCase() === part.rcCommit.toLowerCase();
        centres.push({ centreId: part.centreId, rcHex, ok });
      } catch (e) {
        if (isTransient(e)) throw e;
        centres.push({ centreId: part.centreId, rcHex: null, ok: false, message: explainError(e, t, cfg) });
      }
    }
    const d = { sets, setErrors, centres, signatureHex, drawnSet, burned };
    onData(d);
    return d;
  };
  const reveal = () => act.run(() => retryTransient(once, () => alive.current));

  // The reveal runs by itself once the relay serves the reveal round; the button re-runs it.
  const started = useRef(false);
  useEffect(() => {
    if (!revealed || !served || !b.info || started.current) return;
    started.current = true;
    void reveal();
  }, [revealed, served, b.info]);

  const d = data ?? act.result ?? null;
  const ok = d ? d.centres.filter((c) => c.ok).length : 0;
  return (
    <section className="card" id="reveal" aria-labelledby="reveal-title">
      <div className="card-header d-flex align-items-center gap-2 border-bottom border-dashed">
        <h2 className="header-title me-auto" id="reveal-title">
          {t("public.revealTitle")}
        </h2>
        <button type="button" className="btn btn-sm btn-soft-primary" onClick={() => void reveal()} disabled={!revealed} data-testid="reveal">
          {act.busy ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true" /> : <i className="ti ti-refresh me-1" aria-hidden="true" />}
          {t("publicPage.revealAgain")}
        </button>
      </div>
      <div className="card-body">
        {!revealed ? <p className="text-muted mb-0">{t("public.revealWait", { round: snap.exam.revealRound })}</p> : null}
        {revealed && !b.info ? <p className="text-muted mb-0">{t("centre.noInfo")}</p> : null}
        {revealed && b.info && !served && !act.busy && !d ? <p className="text-muted mb-0">{t("public.revealWait", { round: snap.exam.revealRound })}</p> : null}
        {act.busy && !d ? (
          <p className="text-muted mb-0" role="status">
            <span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />
            {t("publicPage.revealing")}
          </p>
        ) : null}
        <ErrorBox error={act.error} cfg={cfg} />
        {d ? (
          <div className="vstack gap-3" data-testid="revealed">
            <DrawResult drawnSet={d.drawnSet} burned={d.burned} setCount={snap.exam.setCount} />
            <div>
              <h3 className="fs-14 fw-semibold mb-2">{t("publicPage.copiesTitle")}</h3>
              <ul className="list-inline mb-0" data-testid="public-copies">
                {d.sets.map((s) => (
                  <li key={s.setIndex} className="list-inline-item mb-1">
                    <Chip ok>
                      {t("publicPage.setOpen", { label: setLabel(cfg, s.setIndex, snap.exam.setCount), n: s.set.questions.length })}
                    </Chip>
                  </li>
                ))}
                {d.setErrors.map((s) => (
                  <li key={s.setIndex} className="list-inline-item mb-1" title={s.message}>
                    <Chip ok={false}>
                      {setLabel(cfg, s.setIndex, snap.exam.setCount)} {t("public.closed")}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="fs-14 fw-semibold mb-2">
                {t("publicPage.secretsTitle")} <span className="text-muted fw-normal">({ok}/{d.centres.length})</span>
              </h3>
              <ul className="list-inline mb-0" data-testid="rc-checks">
                {d.centres.map((c) => (
                  <li key={c.centreId} className="list-inline-item mb-1" title={c.message}>
                    <Chip ok={c.ok}>
                      {centreName(cfg, snap, c.centreId)} {c.ok ? "OK" : "FAIL"}
                    </Chip>
                  </li>
                ))}
              </ul>
            </div>
            <VerifyDetails>
              <p className="mb-2">{t("publicPage.secretsTech")}</p>
              <p className="mb-2">
                {t("centrePage.sigHex", { round: snap.exam.openRound })} <Hex value={d.signatureHex} head={10} tail={8} />
              </p>
              <ul className="list-unstyled vstack gap-1 mb-0">
                {d.sets.map((s) => (
                  <li key={s.setIndex}>
                    {setLabel(cfg, s.setIndex, snap.exam.setCount)}: {s.set.setLabel}, {t("public.questions", { n: s.set.questions.length })}
                  </li>
                ))}
                {d.setErrors.map((s) => (
                  <li key={s.setIndex}>
                    {setLabel(cfg, s.setIndex)}: {s.message}
                  </li>
                ))}
                {d.centres
                  .filter((c) => c.message)
                  .map((c) => (
                    <li key={c.centreId}>
                      {centreName(cfg, snap, c.centreId)}: {c.message}
                    </li>
                  ))}
              </ul>
            </VerifyDetails>
          </div>
        ) : null}
      </div>
    </section>
  );
}
