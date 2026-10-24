"use client";
// After the reveal round: open the public copy of every set and every centre's tlocked r_c, check commitments.
import { commitRc, drawSet, offlineClient, openRc, openText, parseExamSet, type ExamSet } from "@sealhour/seal";
import { toUtf8String } from "ethers";
import { useConfig } from "../Providers";
import { fetchRoundSignature, roundTimeMs, type BeaconState } from "@/lib/beacon";
import { explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { fetchPublicCopy } from "@/lib/packages";
import { burnedIndexes, centreName, setLabel, submittedIndexes, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Notice, Section } from "../ui";

export interface RevealData {
  /** openTimeMs: the reserve's own opening time (regular sets use the main opening time). */
  sets: { setIndex: number; set: ExamSet; openTimeMs?: number }[];
  setErrors: { setIndex: number; message: string }[];
  centres: { centreId: string; rcHex: string | null; ok: boolean; message?: string }[];
  signatureHex: string;
  drawnSet: number;
  burned: number[];
}

export function RevealPanel({ snap, b, data, onData }: { snap: ExamSnapshot; b: BeaconState; data: RevealData | null; onData: (d: RevealData) => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const act = useAction<RevealData>();
  const revealed = b.round >= snap.exam.revealRound;

  const reveal = () =>
    act.run(async () => {
      if (!b.info) throw new Error(t("centre.noInfo"));
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
          centres.push({ centreId: part.centreId, rcHex: null, ok: false, message: explainError(e, t, cfg) });
        }
      }
      const d = { sets, setErrors, centres, signatureHex, drawnSet, burned };
      onData(d);
      return d;
    });

  const d = data ?? act.result ?? null;
  return (
    <Section title={t("public.revealTitle")} id="reveal">
      <p>{revealed ? t("public.revealBody") : t("public.revealWait", { round: snap.exam.revealRound })}</p>
      <Button onClick={() => void reveal()} busy={act.busy} testId="reveal">
        {t("public.revealButton")}
      </Button>
      <ErrorBox error={act.error} cfg={cfg} />
      {d ? (
        <div className="vstack gap-1 mt-3" data-testid="revealed">
          <Notice tone="info">
            {t("public.drawnIs", {
              label: setLabel(cfg, d.drawnSet),
              burned: d.burned.length ? d.burned.map((i) => setLabel(cfg, i)).join(", ") : t("common.none"),
            })}
          </Notice>
          <h3>{t("public.publicCopies")}</h3>
          <ul className="list-unstyled vstack gap-2 mb-3">
            {d.sets.map((s) => (
              <li key={s.setIndex}>
                <Chip ok>{t("public.opened")}</Chip> {setLabel(cfg, s.setIndex, snap.exam.setCount)} : {s.set.setLabel}, {t("public.questions", { n: s.set.questions.length })}
              </li>
            ))}
            {d.setErrors.map((s) => (
              <li key={s.setIndex}>
                <Chip ok={false}>{t("public.closed")}</Chip> {setLabel(cfg, s.setIndex)} : {s.message}
              </li>
            ))}
          </ul>
          <h3>{t("public.rcTitle")}</h3>
          <ul className="list-unstyled vstack gap-2 mb-3" data-testid="rc-checks">
            {d.centres.map((c) => (
              <li key={c.centreId}>
                <Chip ok={c.ok}>{c.ok ? "OK" : "FAIL"}</Chip> {centreName(cfg, snap, c.centreId)} {c.message ? `: ${c.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Section>
  );
}
