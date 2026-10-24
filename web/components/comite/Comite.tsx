"use client";
// Committee page (/committee/): the committee comes from the Acting-as chip; if the actor is not a committee,
// the first step is the committee picker (no dead end). Steps: 1 Check the list, 2 Your set,
// 3 Seal and publish (one action; "Already on chain" is a protection), 4 Burn your set (confirmation, time left).
import { useEffect, useState, type ChangeEvent } from "react";
import { parseExamSet, sealPackage, serializeExamSet, tlockText, type ExamSet } from "@sealhour/seal";
import { useApp, useConfig } from "../Providers";
import { FrozenList, Protected, Step, StepList, TxStep, VerifyDetails, type StepState } from "../blocks";
import { ExamCard, useExamId } from "../ExamPicker";
import { RolePicker } from "../Header";
import { Button, ErrorBox, Field, Hex, Loading, Notice, TxOutcome } from "../ui";
import { useActor } from "@/lib/actor";
import { roundTimeMs } from "@/lib/beacon";
import { registry, revertName, sendTx, type TxResult } from "@/lib/chain";
import { fetchText, sharedUrl } from "@/lib/config";
import { explainError } from "@/lib/errors";
import { formatDuration, hm, useI18n, type TFn } from "@/lib/i18n";
import { downloadText, packageUri, type PackageIndex } from "@/lib/packages";
import { setLabel, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { usePhase } from "@/lib/usePhase";
import { useSnapshot } from "@/lib/useSnapshot";

type ListVerdict = { ok: true } | { ok: false; reason: string };

function checkList(snap: ExamSnapshot, announced: number, t: TFn): ListVerdict {
  if (!snap.exam.frozen) return { ok: false, reason: t("comite.notFrozen") };
  if (snap.exam.centreCount !== announced || snap.centres.length !== announced) {
    return { ok: false, reason: t("comite.countMismatch", { chain: snap.exam.centreCount, announced }) };
  }
  if (snap.centres.some((c) => !c.recipient)) return { ok: false, reason: t("comite.missingKey") };
  return { ok: true };
}

export function Comite() {
  const cfg = useConfig();
  const { t } = useI18n();
  const { role } = useApp();
  const p = usePhase();
  const exam = useExamId(cfg.demo.examId);
  const { snap, loading, error, reload } = useSnapshot(cfg, exam.examId);
  const [set, setSet] = useState<ExamSet | null>(null);
  const refresh = () => {
    reload();
    p.reload();
  };

  const committee = role?.kind === "committee" ? role.committee : undefined;
  const isReserve = committee !== undefined && committee.address.toLowerCase() === cfg.demo.reserveCommittee.address.toLowerCase();
  const setIndex = committee ? (isReserve && snap?.exam.created ? snap.exam.setCount : committee.setIndex) : -1;
  const label = snap && committee ? setLabel(cfg, setIndex, snap.exam.setCount) : committee?.label ?? "";

  let steps;
  if (!committee) {
    steps = (
      <StepList>
        <Step key="pick" title={t("actor.pickCommittee")} state="current">
          <p className="mb-3">{t("committee.pickLine")}</p>
          <div style={{ maxWidth: 320 }}>
            <RolePicker kinds={["committee"]} label={t("committee.pickLabel")} />
          </div>
        </Step>
        <Step title={t("committee.step.list")} state="future" />
        <Step title={t("committee.step.set")} state="future" />
        <Step title={t("comite.sealTitle")} state="future" />
      </StepList>
    );
  } else if (snap) {
    const e = snap.exam;
    const verdict = checkList(snap, cfg.demo.announcedCentreCount, t);
    const onChain = snap.packages.find((x) => x.setIndex === setIndex);
    const submitted = Boolean(onChain?.submitted);
    const burned = Boolean(onChain?.burned);
    const openRound = isReserve ? e.reserveOpenRound : e.openRound;
    const tooLate = e.created && p.b.round >= openRound;
    const st: Record<string, StepState> = {
      list: verdict.ok ? "done" : "current",
      set: set || submitted ? "done" : verdict.ok ? "current" : "future",
      seal: submitted ? "done" : verdict.ok && set && e.created && !tooLate ? "current" : "future",
      burn: burned || (tooLate && !isReserve) ? "done" : submitted && !isReserve ? "current" : "future",
    };
    steps = (
      <StepList>
        <Step
          key="list"
          id="list"
          title={t("committee.step.list")}
          state={st.list}
          summary={
            <span>
              <strong data-testid="chain-count">{e.centreCount}</strong> {t("committee.listSummary")}
            </span>
          }
        >
          <FrozenList centres={snap.centres} frozen={e.frozen} count={e.centreCount} announced={cfg.demo.announcedCentreCount} listRoot={e.listRoot} />
          {!verdict.ok ? (
            <div className="mt-3">
              <Notice tone="error" testId="seal-refused">
                {verdict.reason}
              </Notice>
            </div>
          ) : null}
        </Step>
        <SetStep state={st.set} setIndex={setIndex} onChange={setSet} />
        <SealStep
          state={st.seal}
          snap={snap}
          setIndex={setIndex}
          label={label}
          set={set}
          refusal={!verdict.ok ? verdict.reason : !e.created ? t("comite.examNotCreated") : !set ? t("comite.noSet") : tooLate ? t("comite.tooLateToSeal") : undefined}
          onDone={refresh}
        />
        {e.created ? (
          <BurnStep state={st.burn} snap={snap} setIndex={setIndex} label={label} isReserve={isReserve} burned={burned} openAt={roundTimeMs(cfg, p.b.info, openRound)} tooLate={tooLate} onDone={refresh} />
        ) : null}
      </StepList>
    );
  }

  const onChainCommittee = snap?.packages.find((x) => x.setIndex === setIndex)?.committee;
  return (
    <div className="row">
      <div className="col-xl-8">
        {loading && !snap ? <Loading /> : null}
        <ErrorBox error={error} cfg={cfg} />
        {steps}
      </div>
      <div className="col-xl-4">
        {committee ? (
          <section className="card" aria-labelledby="you-title">
            <div className="card-body">
              <div className="d-flex align-items-center gap-3">
                <span className="avatar-lg flex-shrink-0">
                  <span className="avatar-title text-bg-primary rounded-circle fs-24 fw-bold">{label}</span>
                </span>
                <div className="min-w-0">
                  <h2 className="header-title mb-0" id="you-title">
                    {t("role.committee", { label })}
                  </h2>
                  <p className="text-muted mb-0">{t("committee.youLine", { label })}</p>
                </div>
              </div>
              {onChainCommittee && onChainCommittee.toLowerCase() !== committee.address.toLowerCase() ? (
                <div className="mt-3">
                  <Notice tone="error">{t("comite.notThisCommittee")}</Notice>
                </div>
              ) : null}
              <div className="mt-3">
                <RolePicker kinds={["committee"]} label={t("committee.switch")} />
              </div>
              <VerifyDetails>
                <p className="mb-0">
                  {t("committee.address")} <Hex value={committee.address} head={10} tail={8} />
                </p>
              </VerifyDetails>
            </div>
          </section>
        ) : null}
        <ExamCard exam={exam} snap={snap} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 2. Your set */

function SetStep({ state, setIndex, onChange }: { state: StepState; setIndex: number; onChange: (s: ExamSet | null) => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const load = useAction<void>();
  const draftUrl = sharedUrl(cfg, `sets/set-${setIndex}.json`);
  const loadDraft = () => load.run(async () => setText(await fetchText(draftUrl)));

  useEffect(() => {
    setText("");
    void loadDraft();
  }, [setIndex, draftUrl]);

  let parsed: ExamSet | null = null;
  let parseError: string | null = null;
  if (text.trim()) {
    try {
      parsed = parseExamSet(text);
    } catch (e) {
      parseError = (e as Error).message;
    }
  }
  // Report the parsed set whenever the text changes (parsed is derived from text).
  useEffect(() => onChange(parsed), [text]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text()
      .then(setText)
      .catch(() => setText(""));
  };

  const preview = parsed ? (
    <span data-testid="set-valid">{t("committee.setPreview", { label: parsed.setLabel, n: parsed.questions.length })}</span>
  ) : null;

  return (
    <Step id="set" title={t("committee.step.set")} state={state} summary={preview ?? t("committee.setSealedOnly")}>
      {parsed ? (
        <div className="d-flex align-items-center gap-3">
          <span className="avatar-md flex-shrink-0">
            <span className="avatar-title bg-primary-subtle text-primary rounded fs-22">
              <i className="ti ti-file-text" aria-hidden="true" />
            </span>
          </span>
          <div className="min-w-0">
            <p className="fw-semibold mb-0">
              {preview} <span className="fw-normal text-muted">{parsed.examTitle}</span>
            </p>
            <p className="text-muted mb-0 text-truncate">{t("committee.firstQuestion", { q: parsed.questions[0]!.text })}</p>
          </div>
        </div>
      ) : load.error ? (
        <Notice tone="warn">{t("committee.noDraft")}</Notice>
      ) : parseError ? (
        <Notice tone="error">
          {t("comite.setInvalid")} {parseError}
        </Notice>
      ) : (
        <Loading />
      )}
      <VerifyDetails title={t("committee.editSet")}>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
          <Button variant="secondary" onClick={() => void loadDraft()} busy={load.busy}>
            {t("comite.loadDraft")}
          </Button>
          <label className="btn btn-light mb-0">
            {t("comite.importFile")}
            <input type="file" accept="application/json,.json" onChange={onFile} className="visually-hidden" />
          </label>
        </div>
        {load.error ? <p className="text-muted">{t("comite.draftMissing", { url: draftUrl })}</p> : null}
        <Field label={t("comite.setJson")} htmlFor="set-json">
          <textarea id="set-json" rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="form-control font-monospace" />
        </Field>
      </VerifyDetails>
    </Step>
  );
}

/* ---------------------------------------------------------------- 3. Seal and publish */

interface Sealed {
  index: PackageIndex;
  files: Record<string, string>;
  uri: string;
}

interface SealResult extends Sealed {
  publish: { kind: "tx"; tx: TxResult } | { kind: "already"; chainRoot: string };
}

function SealStep({
  state,
  snap,
  setIndex,
  label,
  set,
  refusal,
  onDone,
}: {
  state: StepState;
  snap: ExamSnapshot;
  setIndex: number;
  label: string;
  set: ExamSet | null;
  refusal?: string;
  onDone: () => void;
}) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { wallet } = useActor();
  const { b } = usePhase();
  const isReserve = setIndex === snap.exam.setCount;
  const openRound = isReserve ? snap.exam.reserveOpenRound : snap.exam.openRound;
  const revealRound = isReserve ? snap.exam.reserveRevealRound : snap.exam.revealRound;
  const onChain = snap.packages.find((x) => x.setIndex === setIndex);
  const openAt = hm(roundTimeMs(cfg, b.info, openRound), locale);
  // Files sealed but not published yet (publish failed): kept so a retry publishes the same root, no re-seal.
  const [pending, setPending] = useState<Sealed | null>(null);
  useEffect(() => setPending(null), [set, setIndex]);

  const seal = async (): Promise<Sealed> => {
    if (!set) throw new Error(t("comite.noSet"));
    const centres = snap.centres.map((c) => ({ centreId: c.centreId, recipient: c.recipient! }));
    const res = await sealPackage({ set, centres, round: openRound, client: b.client });
    const publicCopy = await tlockText(serializeExamSet(set), revealRound, b.client);
    const files: Record<string, string> = { "public.tlock": publicCopy };
    const items = res.items.map((it) => {
      const file = `${it.centreId}.tlock`;
      files[file] = it.ciphertext;
      return { centreId: it.centreId, file, leaf: it.leaf };
    });
    const index: PackageIndex = { setIndex, label, round: openRound, root: res.root, items, publicCopy: "public.tlock" };
    files["index.json"] = JSON.stringify(index, null, 2) + "\n";
    return { index, files, uri: packageUri(snap.examId, setIndex) };
  };

  const run = async (): Promise<SealResult> => {
    if (!wallet) throw new Error(t("common.needWallet"));
    const s = pending ?? (await seal());
    setPending(s);
    let publish: SealResult["publish"];
    try {
      publish = { kind: "tx", tx: await sendTx(registry(cfg, wallet), "submitPackage", [snap.examId, setIndex, s.index.root, s.uri]) };
    } catch (e) {
      if (revertName(e, cfg) !== "AlreadyDone") throw e;
      publish = { kind: "already", chainRoot: onChain?.root ?? "" };
    }
    setPending(null);
    return { ...s, publish };
  };

  const files = (r: Sealed) => (
    <VerifyDetails title={t("committee.files")}>
      <p className="mb-2">
        {t("comite.sealedRoot")} <Hex value={r.index.root} head={10} tail={8} />
      </p>
      <ul className="list-unstyled vstack gap-1 mb-3">
        {Object.entries(r.files).map(([name, content]) => (
          <li key={name}>
            <button type="button" className="btn btn-link p-0 align-baseline" onClick={() => downloadText(name, content, name.endsWith(".json") ? "application/json" : "text/plain")}>
              {name}
            </button>{" "}
            <span className="text-muted">{t("common.bytes", { n: content.length })}</span>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        onClick={() => downloadText(`sealhour-set-${setIndex}-bundle.json`, JSON.stringify({ uri: r.uri, files: r.files }, null, 2), "application/json")}
      >
        {t("comite.downloadBundle")}
      </Button>
      <p className="form-text mb-0">{t("comite.publishHint", { uri: r.uri })}</p>
    </VerifyDetails>
  );

  const outcome = (r: SealResult) => (
    <div className="vstack gap-2" data-testid="sealed">
      <Notice tone="ok">{t("committee.sealedHere", { n: r.index.items.length, time: openAt })}</Notice>
      {r.publish.kind === "tx" ? (
        <TxOutcome tx={r.publish.tx} />
      ) : (
        <Protected title={t("committee.alreadyTitle")} testId="already-done">
          {t("comite.alreadyDone")} <Hex value={r.publish.chainRoot} head={10} tail={8} />
        </Protected>
      )}
      {files(r)}
    </div>
  );

  return (
    <Step
      id="seal"
      title={t("comite.sealTitle")}
      state={state}
      summary={t("committee.sealedSummary", { time: openAt })}
      aside={
        onChain?.submitted ? (
          <span className="badge badge-soft-success px-2 py-1 d-none d-sm-inline-flex align-items-center">
            <i className="ti ti-shield-check me-1" aria-hidden="true" />
            {t("committee.onChainBadge")}
          </span>
        ) : null
      }
    >
      <p className="mb-3">{t("committee.sealLine", { n: snap.centres.length, time: openAt })}</p>
      {onChain?.submitted ? (
        <p className="mb-3">
          <i className="ti ti-shield-check text-success me-1" aria-hidden="true" />
          {t("committee.alreadyLine")}
        </p>
      ) : null}
      <TxStep<SealResult>
        label={pending ? t("committee.retryPublish") : onChain?.submitted ? t("committee.publishAgain") : t("committee.sealAndPublish", { n: snap.centres.length })}
        variant={onChain?.submitted ? "secondary" : "primary"}
        run={run}
        onDone={onDone}
        disabled={refusal !== undefined}
        disabledReason={refusal}
        testId="seal"
        outcome={outcome}
      />
      {pending ? (
        <div className="mt-3" data-testid="sealed-pending">
          <Notice tone="warn">{t("committee.sealedNotPublished", { n: pending.index.items.length })}</Notice>
          {files(pending)}
        </div>
      ) : null}
    </Step>
  );
}

/* ---------------------------------------------------------------- 4. Burn your set */

function BurnStep({
  state,
  snap,
  setIndex,
  label,
  isReserve,
  burned,
  openAt,
  tooLate,
  onDone,
}: {
  state: StepState;
  snap: ExamSnapshot;
  setIndex: number;
  label: string;
  isReserve: boolean;
  burned: boolean;
  openAt: number;
  tooLate: boolean;
  onDone: () => void;
}) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { wallet } = useActor();
  const { b } = usePhase();

  const burn = async (): Promise<{ tx?: TxResult; refused?: string }> => {
    if (!wallet) throw new Error(t("common.needWallet"));
    try {
      return { tx: await sendTx(registry(cfg, wallet), "burnSet", [snap.examId, setIndex]) };
    } catch (e) {
      // After the opening the chain refuses: that refusal is the protection, not a failure.
      if (revertName(e, cfg) === "TooLate") return { refused: explainError(e, t, cfg) };
      throw e;
    }
  };

  const summary = burned ? t("committee.burnedSummary", { label }) : t("committee.burnClosed", { time: hm(openAt, locale) });
  return (
    <Step id="burn" title={t("committee.step.burn")} state={state} summary={summary}>
      <p className="mb-3">{t("comite.burnBody")}</p>
      {burned ? (
        <Notice tone="info">{t("committee.burnedSummary", { label })}</Notice>
      ) : isReserve ? null : tooLate ? (
        <p className="mb-3 text-muted">{t("committee.burnTooLate", { time: hm(openAt, locale) })}</p>
      ) : (
        <p className="mb-3">
          <i className="ti ti-hourglass me-1 text-warning" aria-hidden="true" />
          {t("committee.timeLeft")} <strong className="tabular">{formatDuration(openAt - b.nowMs)}</strong>{" "}
          <span className="text-muted">({t("committee.until", { time: hm(openAt, locale) })})</span>
        </p>
      )}
      <TxStep<{ tx?: TxResult; refused?: string }>
        label={tooLate ? t("committee.burnAnyway") : t("comite.burn")}
        variant={tooLate ? "secondary" : "danger"}
        run={burn}
        onDone={onDone}
        disabled={burned || isReserve}
        disabledReason={isReserve ? t("comite.burnReserve") : t("committee.burnedSummary", { label })}
        confirm={tooLate ? undefined : t("committee.burnConfirm", { label })}
        confirmLabel={t("committee.burnConfirmButton", { label })}
        testId="burn"
        outcome={(r) =>
          r.refused ? (
            <Protected testId="burn-refused">{r.refused}</Protected>
          ) : r.tx ? (
            <TxOutcome tx={r.tx} />
          ) : null
        }
      />
    </Step>
  );
}
