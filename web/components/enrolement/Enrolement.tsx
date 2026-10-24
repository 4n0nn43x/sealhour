"use client";
// Office page (/enrolment/): numbered steps. 1 Register the centres, 2 Freeze the list, 3 Create the exam,
// 4 Try to cheat (phantom centre), moved first once the list is frozen and the exam created.
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { isAddress } from "ethers";
import { generateCentreKey, listRoot, recipientToBytes32 } from "@sealhour/seal";
import { useApp, useConfig } from "../Providers";
import { FrozenList, Protected, StatWidget, Step, StepList, TxStep, VerifyDetails, type StepState } from "../blocks";
import { ExamCard, useExamId } from "../ExamPicker";
import { roleName } from "../Header";
import { Button, ErrorBox, Field, Hex, Loading, Notice } from "../ui";
import { useActor } from "@/lib/actor";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import { registry, sendTx } from "@/lib/chain";
import { explainError } from "@/lib/errors";
import { hm, useI18n } from "@/lib/i18n";
import { splitList, toBytes32Id } from "@/lib/ids";
import { readAllCentres, type CentreInfo, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { usePhase } from "@/lib/usePhase";
import { useSnapshot } from "@/lib/useSnapshot";

export function Enrolement() {
  const cfg = useConfig();
  const { t } = useI18n();
  const { role, setRole } = useApp();
  const p = usePhase();
  const exam = useExamId(cfg.demo.examId);
  const { snap, loading, error, reload } = useSnapshot(cfg, exam.examId);
  const [all, setAll] = useState<CentreInfo[]>([]);
  const [allError, setAllError] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    readAllCentres(cfg)
      .then((c) => alive && (setAll(c), setAllError(undefined)))
      .catch((e: unknown) => alive && setAllError(e ?? new Error("read failed")));
    return () => {
      alive = false;
    };
  }, [cfg, tick]);

  const { reload: phaseReload } = p;
  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    reload();
    phaseReload();
  }, [reload, phaseReload]);

  const announced = cfg.demo.announcedCentreCount;
  const frozen = Boolean(snap?.exam.frozen);
  const created = Boolean(snap?.exam.created);
  const count = snap?.exam.centreCount ?? 0;

  let steps: ReactNode = null;
  if (snap) {
    const centresDone = frozen || all.length >= announced;
    const state: Record<string, StepState> = {
      register: centresDone ? "done" : "current",
      freeze: frozen ? "done" : centresDone ? "current" : "future",
      create: created ? "done" : frozen ? "current" : "future",
      phantom: frozen && created ? "current" : "future",
    };
    const items: Record<string, ReactNode> = {
      register: <RegisterStep key="register" state={state.register} count={all.length} onDone={refresh} />,
      freeze: <FreezeStep key="freeze" state={state.freeze} snap={snap} all={all} onDone={refresh} />,
      create: <CreateStep key="create" state={state.create} snap={snap} b={p.b} onDone={refresh} />,
      phantom: <PhantomStep key="phantom" state={state.phantom} snap={snap} onDone={refresh} />,
    };
    const order = frozen && created ? ["phantom", "register", "freeze", "create"] : ["register", "freeze", "create", "phantom"];
    steps = <StepList>{order.map((k) => items[k])}</StepList>;
  }

  return (
    <div className="row">
      <div className="col-xl-8">
        {role && role.kind !== "office" ? (
          <div className="alert alert-info d-flex flex-wrap align-items-center gap-2" role="status">
            <i className="ti ti-info-circle fs-18" aria-hidden="true" />
            <span className="me-auto">{t("office.notOffice", { role: roleName(role, t) })}</span>
            <button type="button" className="btn btn-sm btn-info" onClick={() => setRole("office")}>
              {t("office.actAsOffice")}
            </button>
          </div>
        ) : null}
        {loading && !snap ? <Loading /> : null}
        <ErrorBox error={error ?? allError} cfg={cfg} />
        {steps}
      </div>
      <div className="col-xl-4">
        <StatWidget
          label={t("frozen.count")}
          value={`${frozen ? count : "-"} / ${announced}`}
          icon="buildings-2-bold-duotone"
          tone={frozen ? (count === announced ? "success" : "danger") : "secondary"}
          sub={frozen ? (count === announced ? t("frozen.match") : t("frozen.mismatch")) : t("frozen.notYet")}
        />
        <ExamCard exam={exam} snap={snap} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 1. Register the centres */

function RegisterStep({ state, count, onDone }: { state: StepState; count: number; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [recipient, setRecipient] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const gen = useAction<void>();

  const centreId = name.trim() ? toBytes32Id(`centre:${name.trim()}`) : "";
  let keyHex: string | null = null;
  let keyError = false;
  if (recipient.trim()) {
    try {
      keyHex = recipientToBytes32(recipient);
    } catch {
      keyError = true;
    }
  }
  const valid = Boolean(name.trim() && isAddress(operator) && keyHex);

  const generate = () =>
    gen.run(async () => {
      const k = await generateCentreKey();
      setRecipient(k.recipient);
      setIdentity(k.identity);
    });

  const submit = async () => {
    if (!wallet) throw new Error(t("common.needWallet"));
    return sendTx(registry(cfg, wallet), "registerCentre", [centreId, keyHex, operator, name.trim()]);
  };

  return (
    <Step id="register" title={t("office.step.centres")} state={state} summary={t("office.centresSummary", { n: count })}>
      <p className="mb-3">{t("office.centresLine", { n: count })}</p>
      <div className="row row-cols-1 row-cols-md-2">
        <Field label={t("common.name")} htmlFor="c-name">
          <input id="c-name" className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="Westbrook" />
        </Field>
        <Field label={t("office.operator")} htmlFor="c-op" hint={t("enrol.operatorHint")}>
          <input id="c-op" className="form-control" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="0x..." list="demo-operators" />
          <datalist id="demo-operators">
            {cfg.demo.centres.map((c) => (
              <option key={c.address} value={c.address}>
                {c.name}
              </option>
            ))}
          </datalist>
        </Field>
      </div>
      <Field label={t("enrol.recipient")} htmlFor="c-key" hint={t("enrol.recipientHint")}>
        <div className="input-group">
          <input id="c-key" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="age1..." className="form-control" />
          <Button variant="secondary" onClick={() => void generate()} busy={gen.busy}>
            {t("enrol.generateKey")}
          </Button>
        </div>
      </Field>
      {keyError ? <Notice tone="warn">{t("enrol.badRecipient")}</Notice> : null}
      {identity ? (
        <Notice tone="warn">
          {t("enrol.identityWarning")}
          <pre className="code mb-0 mt-2">{identity}</pre>
        </Notice>
      ) : null}
      <ErrorBox error={gen.error} cfg={cfg} />
      <TxStep label={t("enrol.register")} run={submit} onDone={onDone} disabled={!valid} disabledReason={t("office.registerFill")} testId="register-centre" />
      {centreId ? (
        <VerifyDetails>
          <p className="mb-0">
            {t("enrol.centreId")} <Hex value={centreId} head={10} tail={8} />
          </p>
        </VerifyDetails>
      ) : null}
    </Step>
  );
}

/* ---------------------------------------------------------------- 2. Freeze the list */

function FreezeStep({ state, snap, all, onDone }: { state: StepState; snap: ExamSnapshot; all: CentreInfo[]; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const announced = cfg.demo.announcedCentreCount;
  const frozen = snap.exam.frozen;
  const count = snap.exam.centreCount;
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    // Default selection: the demo centres that are registered.
    const demoIds = cfg.demo.centres.map((c) => c.centreId.toLowerCase());
    setSelected(all.filter((c) => demoIds.includes(c.centreId.toLowerCase())).map((c) => c.centreId));
  }, [all, cfg]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const root = selected.length > 0 ? listRoot(selected) : null;

  const freeze = async () => {
    if (!wallet) throw new Error(t("common.needWallet"));
    return sendTx(registry(cfg, wallet), "freezeCentres", [snap.examId, selected, root, selected.length]);
  };

  return (
    <Step id="freeze" title={t("office.step.freeze")} state={state} summary={t("office.freezeSummary", { n: count, announced })}>
      {frozen ? null : <p className="mb-3">{t("enrol.pickCentres")}</p>}
      <FrozenList
        centres={frozen ? snap.centres : all}
        frozen={frozen}
        count={count}
        announced={announced}
        listRoot={snap.exam.listRoot}
        selectable={!frozen}
        selected={selected}
        onToggle={toggle}
      />
      {frozen ? (
        count !== announced ? (
          <Notice tone="error">{t("enrol.countMismatch")}</Notice>
        ) : null
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-muted">{t("office.selected", { n: selected.length })}</p>
          {selected.length !== announced ? <Notice tone="warn">{t("enrol.selectedMismatch", { n: announced })}</Notice> : null}
        </div>
      )}
      <TxStep
        label={t("enrol.freeze")}
        run={freeze}
        onDone={onDone}
        disabled={frozen || selected.length === 0}
        disabledReason={frozen ? t("enrol.alreadyFrozen") : t("office.pickOne")}
        testId="freeze"
      />
      {!frozen && root ? (
        <VerifyDetails>
          <p className="mb-0">
            {t("frozen.fingerprint")} <span className="text-muted">({t("enrol.listRoot")})</span>: <Hex value={root} head={10} tail={8} />
          </p>
        </VerifyDetails>
      ) : null}
    </Step>
  );
}

/* ---------------------------------------------------------------- 3. Create the exam */

interface Minutes {
  open: number;
  reveal: number;
  reserveOpen: number;
  reserveReveal: number;
}

function computeRounds(current: number, period: number, m: Minutes) {
  const r = (min: number) => Math.max(1, Math.ceil((min * 60) / period));
  const open = current + r(m.open);
  const reveal = open + r(m.reveal);
  const reserveOpen = reveal + r(m.reserveOpen);
  const reserveReveal = reserveOpen + r(m.reserveReveal);
  return { open, reveal, reserveOpen, reserveReveal };
}

function CreateStep({ state, snap, b, onDone }: { state: StepState; snap: ExamSnapshot; b: BeaconState; onDone: () => void }) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { wallet } = useActor();
  const [m, setM] = useState<Minutes>({ open: 2, reveal: 3, reserveOpen: 2, reserveReveal: 2 });
  const [committees, setCommittees] = useState(cfg.demo.committees.map((c) => c.address).join("\n"));
  const [reserve, setReserve] = useState(cfg.demo.reserveCommittee.address);
  const e = snap.exam;
  const at = (round: number) => hm(roundTimeMs(cfg, b.info, round), locale);
  const rounds = computeRounds(b.round, b.period, m);
  const list = splitList(committees);
  const addrOk = list.length >= 2 && list.length <= 8 && list.every((a) => isAddress(a)) && isAddress(reserve);

  const create = async () => {
    if (!wallet) throw new Error(t("common.needWallet"));
    const fresh = computeRounds(b.round, b.period, m);
    return sendTx(registry(cfg, wallet), "createExam", [snap.examId, fresh.open, fresh.reveal, fresh.reserveOpen, fresh.reserveReveal, list, reserve]);
  };

  const minuteField = (k: keyof Minutes, label: string) => (
    <Field label={label} htmlFor={`m-${k}`}>
      <input id={`m-${k}`} className="form-control" type="number" min={1} step={1} value={m[k]} onChange={(ev) => setM({ ...m, [k]: Math.max(1, Number(ev.target.value) || 1) })} />
    </Field>
  );
  const roundList = (r: { open: number; reveal: number; reserveOpen: number; reserveReveal: number }) => (
    <p className="mb-2">{t("office.roundNumbers", { open: r.open, reveal: r.reveal, ro: r.reserveOpen, rr: r.reserveReveal })}</p>
  );

  return (
    <Step id="create" title={t("enrol.create")} state={state} summary={e.created ? t("office.createdSummary", { open: at(e.openRound), reveal: at(e.revealRound) }) : undefined}>
      {e.created ? (
        <>
          <p className="mb-3">
            {t("office.createdLine", { open: at(e.openRound), reveal: at(e.revealRound), sets: e.setCount, reserve: at(e.reserveOpenRound) })}
          </p>
          <VerifyDetails>{roundList({ open: e.openRound, reveal: e.revealRound, reserveOpen: e.reserveOpenRound, reserveReveal: e.reserveRevealRound })}</VerifyDetails>
        </>
      ) : null}
      {/* Stays mounted once created, so the "Transaction confirmed" outcome stays in view. */}
      <TxStep
        label={t("enrol.create")}
        run={create}
        onDone={onDone}
        disabled={e.created || !e.frozen || !addrOk}
        disabledReason={e.created ? null : !e.frozen ? t("enrol.freezeFirst") : t("enrol.badCommittees")}
        testId="create-exam"
      >
        {e.created ? null : (
          <>
            <div className="row row-cols-2 row-cols-lg-4">
              {minuteField("open", t("enrol.openIn"))}
              {minuteField("reveal", t("enrol.revealAfter"))}
              {minuteField("reserveOpen", t("enrol.reserveOpenAfter"))}
              {minuteField("reserveReveal", t("enrol.reserveRevealAfter"))}
            </div>
            <p className="text-muted" data-testid="rounds-preview">
              {t("office.preview", { open: at(rounds.open), reveal: at(rounds.reveal), ro: at(rounds.reserveOpen) })}
            </p>
            {!addrOk ? <Notice tone="warn">{t("enrol.badCommittees")}</Notice> : null}
            <div className="mb-3">
              <VerifyDetails title={t("office.advanced")}>
                {roundList(rounds)}
                <Field label={t("enrol.committees")} htmlFor="committees" hint={t("enrol.committeesHint")}>
                  <textarea id="committees" className="form-control font-monospace" rows={4} value={committees} onChange={(ev) => setCommittees(ev.target.value)} />
                </Field>
                <Field label={t("enrol.reserveCommittee")} htmlFor="reserve">
                  <input id="reserve" className="form-control font-monospace" value={reserve} onChange={(ev) => setReserve(ev.target.value)} />
                </Field>
              </VerifyDetails>
            </div>
          </>
        )}
      </TxStep>
    </Step>
  );
}

/* ---------------------------------------------------------------- 4. Try to cheat */

interface Attempt {
  label: string;
  refused: boolean;
  message: string;
}

function PhantomStep({ state, snap, onDone }: { state: StepState; snap: ExamSnapshot; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();

  const attempt = async (): Promise<Attempt[]> => {
    if (!wallet) throw new Error(t("common.needWallet"));
    const c = registry(cfg, wallet);
    const phantom = cfg.demo.phantom;
    const out: Attempt[] = [];
    const ids = [...snap.centres.map((x) => x.centreId), phantom.centreId];
    // 1. Add the phantom to the exam's list (refreeze with one more centre).
    try {
      await sendTx(c, "freezeCentres", [snap.examId, ids, listRoot(ids), ids.length]);
      out.push({ label: t("phantom.addToList", { name: phantom.name }), refused: false, message: t("phantom.accepted") });
    } catch (e) {
      out.push({ label: t("phantom.addToList", { name: phantom.name }), refused: true, message: explainError(e, t, cfg) });
    }
    // 2. Swap the key of a listed centre for one the office holds.
    const target = snap.centres[0];
    if (target) {
      const k = await generateCentreKey();
      try {
        await sendTx(c, "registerCentre", [target.centreId, recipientToBytes32(k.recipient), wallet.address, target.name]);
        out.push({ label: t("phantom.swapKey", { name: target.name }), refused: false, message: t("phantom.accepted") });
      } catch (e) {
        out.push({ label: t("phantom.swapKey", { name: target.name }), refused: true, message: explainError(e, t, cfg) });
      }
    }
    return out;
  };

  return (
    <Step id="phantom" title={t("office.step.cheat")} state={state}>
      <p className="mb-3">{t("phantom.body", { name: cfg.demo.phantom.name })}</p>
      <TxStep<Attempt[]>
        label={t("phantom.button")}
        run={attempt}
        onDone={onDone}
        disabled={!snap.exam.frozen}
        disabledReason={t("phantom.needFrozen")}
        testId="phantom"
        outcome={(r) => (
          <ul className="list-unstyled mb-0" data-testid="phantom-result">
            {r.map((a) => (
              <li key={a.label}>
                {a.refused ? (
                  <Protected title={t("phantom.refused")}>
                    <span className="fw-medium">{a.label}.</span> <span className="text-muted">{a.message}</span>
                  </Protected>
                ) : (
                  <Notice tone="error">
                    <strong>{a.label}: </strong>
                    {a.message}
                  </Notice>
                )}
              </li>
            ))}
          </ul>
        )}
      />
    </Step>
  );
}
