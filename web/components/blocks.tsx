"use client";
// Shared building blocks for the role pages, in Osen markup (see components/README.md for props and usage).
// Stable test hooks kept from ui.tsx: notice notice-{tone} classes, data-testid="error", section ids.
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useConfig } from "./Providers";
import { Icon, type IconName } from "./Icon";
import { Button, ErrorBox, Hex, Notice, TxOutcome } from "./ui";
import { relayStatus } from "@/lib/beacon";
import type { TxResult } from "@/lib/chain";
import { explainError } from "@/lib/errors";
import { formatDuration, hm, useI18n } from "@/lib/i18n";
import { setLabel, type CentreInfo, type ParticipationInfo } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { usePhase } from "@/lib/usePhase";

/* ---------------------------------------------------------------- Steps */

/** The step the user last worked in (click or change), so a just-completed step knows when the user moved on. */
const StepFocus = createContext<{ owner: string | null; claim: (key: string) => void }>({ owner: null, claim: () => {} });

/** Numbered vertical steps (Osen timeline rail + cards). Children are <Step>s; numbers come from their order. */
export function StepList({ children }: { children: ReactNode }) {
  const [owner, claim] = useState<string | null>(null);
  return (
    <StepFocus.Provider value={{ owner, claim }}>
      <ol className="step-list list-unstyled mb-0">{children}</ol>
    </StepFocus.Provider>
  );
}

export type StepState = "done" | "current" | "future";

/** One step. current: always open, one primary action inside, no toggle. done: folded to its summary line with
 *  a check; future: greyed with the time it opens. Both unfold with a quiet header button (aria-expanded).
 *  Rule, the same on every page: a step the user just completed stays open (its outcome stays in view) until the
 *  user works in another step; steps already done on load, or done by time passing, are folded. */
export function Step({
  id,
  title,
  state,
  summary,
  opensAt,
  aside,
  children,
}: {
  /** Section id kept for tests and anchors (#register, #freeze, #burn...). */
  id?: string;
  title: string;
  state: StepState;
  /** One line shown when done (and under the title when collapsed). */
  summary?: ReactNode;
  /** Epoch ms when a future step opens (shown as "Opens at 14:32"). */
  opensAt?: number;
  /** Right side of the header (a badge). */
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const bodyId = useId();
  const { owner, claim } = useContext(StepFocus);
  // false: folded; "auto": kept open because the user just completed it here; "user": opened with the toggle.
  const [open, setOpen] = useState<false | "auto" | "user">(false);
  const prev = useRef(state);
  useEffect(() => {
    if (prev.current === state) return;
    const was = prev.current;
    prev.current = state;
    setOpen(state === "done" && was === "current" && owner === bodyId ? "auto" : false);
  }, [state]);
  useEffect(() => {
    if (owner !== bodyId) setOpen((o) => (o === "auto" ? false : o));
  }, [owner, bodyId]);
  const shown = state === "current" || open !== false;
  const titleId = id ? `${id}-title` : `${bodyId}-title`;
  const line = state === "done" ? summary : state === "future" && opensAt ? t("step.opensAt", { time: hm(opensAt, locale) }) : null;
  return (
    // Claimed on click and change, not pointerdown or focus: folding another step must not move this one mid click.
    <li className={`step step-${state}`} aria-current={state === "current" ? "step" : undefined} onClickCapture={() => claim(bodyId)} onChangeCapture={() => claim(bodyId)}>
      <span className="step-num avatar-sm" aria-hidden="true">
        <span className="avatar-title rounded-circle fw-semibold">{state === "done" ? <i className="ti ti-check fs-16" /> : null}</span>
      </span>
      <section className="card" id={id} aria-labelledby={titleId}>
        <div className={`card-header d-flex align-items-center gap-2 ${shown && children ? "border-bottom border-dashed" : ""}`}>
          <div className="flex-grow-1 min-w-0">
            <h2 className="header-title mb-0" id={titleId}>
              {title}
              {state !== "current" ? <span className="visually-hidden"> ({state === "done" ? t("step.srDone") : t("step.srFuture")})</span> : null}
            </h2>
            {line && !shown ? (
              <p className="mb-0 mt-1 text-quiet text-truncate">
                {state === "done" ? <i className="ti ti-circle-check-filled text-success me-1" aria-hidden="true" /> : <i className="ti ti-clock me-1" aria-hidden="true" />}
                {line}
              </p>
            ) : null}
          </div>
          {aside}
          {children && state !== "current" ? (
            <button type="button" className="btn btn-sm btn-link text-quiet text-decoration-none flex-shrink-0 px-1" aria-expanded={shown} aria-controls={bodyId} onClick={() => setOpen(shown ? false : "user")}>
              {shown ? t("step.hide") : t("step.show")}
              <span className="visually-hidden"> {title}</span>
              <i className={`ti ti-chevron-${shown ? "up" : "down"} ms-1`} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {children ? (
          <div className="card-body" id={bodyId} hidden={!shown}>
            {children}
          </div>
        ) : null}
      </section>
    </li>
  );
}

/* ---------------------------------------------------------------- Disclosure, notices, empty state */

/** Collapsible technical block ("Verify it yourself"): hex, keys, roots, files, JSON, HTTP status. Closed by default. */
export function VerifyDetails({ title, children, defaultOpen = false, testId }: { title?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="verify mt-3" data-testid={testId}>
      <button type="button" className="btn btn-sm btn-link text-quiet px-0 text-decoration-none" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <i className={`ti ti-chevron-${open ? "down" : "right"} me-1`} aria-hidden="true" />
        <i className="ti ti-list-search me-1" aria-hidden="true" />
        {title ?? t("verify.title")}
      </button>
      <div id={id} className="verify-body bg-light bg-opacity-50 rounded p-3 mt-2" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

/** "The protection worked" notice for expected refusals (phantom refused, too early, not a centre, already on chain).
 *  Success tone with a shield; keeps the notice notice-ok classes. */
export function Protected({ children, title, testId }: { children: ReactNode; title?: string; testId?: string }) {
  const { t } = useI18n();
  return (
    <div className="alert alert-success d-flex align-items-start gap-2 text-break notice notice-ok" role="status" data-testid={testId}>
      <Icon name="shield-check-bold-duotone" className="fs-24 flex-shrink-0" />
      <div>
        <strong>{title ?? t("protected.title")} </strong>
        {children}
      </div>
    </div>
  );
}

/** Composed Osen empty state: round soft icon, title, one line, optional action. */
export function EmptyState({ icon = "inbox-line-bold-duotone", title, body, action }: { icon?: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-4">
      <div className="avatar-xl mx-auto mb-3">
        <span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-42">
          <Icon name={icon} />
        </span>
      </div>
      <h4 className="fw-semibold mb-1">{title}</h4>
      {body ? <p className="text-muted mb-3">{body}</p> : null}
      {action}
    </div>
  );
}

/** Osen centered stat widget (index.php): uppercase label, round solid icon next to the value, muted line. */
export function StatWidget({ label, value, icon, tone = "primary", sub, testId }: { label: string; value: ReactNode; icon: IconName; tone?: "primary" | "success" | "warning" | "danger" | "info" | "secondary"; sub?: ReactNode; testId?: string }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="card-body text-center">
        <h3 className="text-muted fs-13 text-uppercase fw-medium">{label}</h3>
        <div className="d-flex align-items-center justify-content-center gap-2 my-2 py-1">
          <div className="user-img fs-42 flex-shrink-0">
            <span className={`avatar-title text-bg-${tone} rounded-circle fs-22`}>
              <Icon name={icon} />
            </span>
          </div>
          <p className="h3 mb-0 fw-bold tabular">{value}</p>
        </div>
        <p className="mb-0 text-muted text-truncate">{sub ?? " "}</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Transactions */

/** A transaction or async action with its button, error and outcome (useAction + Button + ErrorBox + TxOutcome),
 *  bare content to put inside a <Step>. `confirm` asks inline before running (burn); focus moves into the
 *  question, then to the outcome (confirmed) or back to the button (cancelled).
 *  `disabledReason` explains a disabled button, e.g. the time it opens. */
export function TxStep<T = TxResult>({
  label,
  run,
  onDone,
  disabled,
  disabledReason,
  confirm,
  confirmLabel,
  variant = "primary",
  testId,
  outcome,
  children,
}: {
  label: string;
  run: () => Promise<T>;
  onDone?: (r: T) => void;
  disabled?: boolean;
  disabledReason?: ReactNode;
  confirm?: ReactNode;
  /** Label of the confirm button (default "Yes, do it"); name the action, e.g. "Burn set C". */
  confirmLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Button test id; the confirm button gets `${testId}-confirm`. */
  testId?: string;
  /** Render the result; default: the transaction hash and block (TxOutcome). */
  outcome?: (r: T) => ReactNode;
  children?: ReactNode;
}) {
  const cfg = useConfig();
  const { t } = useI18n();
  const act = useAction<T>();
  const [asking, setAsking] = useState(false);
  const controls = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLDivElement>(null);
  // Where focus goes once the confirm question mounts or unmounts (its buttons take the focus with them).
  const focusNext = useRef<"controls" | "outcome" | null>(null);
  useEffect(() => {
    const f = focusNext.current;
    if (!f || (f === "outcome" && act.busy)) return;
    focusNext.current = null;
    const done = act.error !== undefined || act.result !== undefined;
    (f === "outcome" && done ? outcomeRef.current : controls.current?.querySelector("button"))?.focus();
  });
  const ask = (on: boolean) => {
    focusNext.current = "controls";
    setAsking(on);
  };
  const go = async () => {
    setAsking(false);
    const r = await act.run(run);
    if (r !== undefined) onDone?.(r);
  };
  return (
    <>
      {children}
      <div ref={controls} style={{ display: "contents" }}>
        {asking ? (
          <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2" role="alertdialog" aria-label={label}>
            <span className="me-auto">{confirm}</span>
            <Button
              variant={variant}
              onClick={() => {
                focusNext.current = "outcome";
                void go();
              }}
              testId={testId ? `${testId}-confirm` : undefined}
            >
              {confirmLabel ?? t("tx.confirm")}
            </Button>
            <Button variant="secondary" onClick={() => ask(false)}>
              {t("tx.cancel")}
            </Button>
          </div>
        ) : (
          <Button variant={variant} onClick={() => (confirm ? ask(true) : void go())} busy={act.busy} disabled={disabled} testId={testId}>
            {label}
          </Button>
        )}
      </div>
      {disabled && disabledReason ? <p className="form-text mb-0">{disabledReason}</p> : null}
      <div className="mt-3" ref={outcomeRef} tabIndex={-1}>
        <ErrorBox error={act.error} cfg={cfg} />
        {act.result !== undefined ? (outcome ? outcome(act.result) : <TxOutcome tx={act.result as unknown as TxResult} />) : null}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Exam data */

/** The frozen centre list: one visible summary line (counts against the notice, test ids chain-count and
 *  announced-count) and the table. selectable: tick boxes for the freeze step (table shown, not folded). */
export function FrozenList({
  centres,
  frozen,
  count,
  announced,
  listRoot,
  participations,
  selectable,
  selected,
  onToggle,
  tableTestId = "centres-table",
  inline,
}: {
  centres: CentreInfo[];
  frozen: boolean;
  /** Centre count on chain (exam.centreCount). */
  count: number;
  announced: number;
  listRoot?: string;
  /** Adds a "Joined" column. */
  participations?: ParticipationInfo[];
  selectable?: boolean;
  selected?: string[];
  onToggle?: (centreId: string) => void;
  tableTestId?: string;
  /** Show the table (and the list fingerprint) directly, for a block that is already collapsible. */
  inline?: boolean;
}) {
  const { t } = useI18n();
  const match = frozen && count === announced;
  const table =
    centres.length === 0 ? (
      <EmptyState icon="buildings-2-bold-duotone" title={t("frozen.empty")} body={t("frozen.emptyBody")} />
    ) : (
      <div className="table-responsive">
        <table className="table table-borderless table-hover table-nowrap align-middle mb-0" data-testid={tableTestId}>
          <thead className="bg-light bg-opacity-50">
            <tr className="text-uppercase fs-12">
              {selectable ? <th scope="col" className="text-muted">{t("enrol.pick")}</th> : null}
              <th scope="col" className="text-muted">{t("common.name")}</th>
              <th scope="col" className="text-muted">{t("common.key")}</th>
              <th scope="col" className="text-muted">{t("common.operator")}</th>
              <th scope="col" className="text-muted">{participations ? t("public.joined") : t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {centres.map((c) => {
              const joined = participations?.find((p) => p.centreId === c.centreId)?.joined;
              return (
                <tr key={c.centreId}>
                  {selectable ? (
                    <td>
                      <input className="form-check-input" type="checkbox" aria-label={c.name} checked={selected?.includes(c.centreId) ?? false} onChange={() => onToggle?.(c.centreId)} />
                    </td>
                  ) : null}
                  <td>
                    <div className="d-flex align-items-center gap-2">
                      <span className="avatar-xs flex-shrink-0">
                        <span className="avatar-title bg-primary-subtle text-primary fw-semibold rounded-circle">{(c.name || "?").slice(0, 1)}</span>
                      </span>
                      <span className="fw-medium">{c.name || "-"}</span>
                    </div>
                  </td>
                  <td>
                    <code className="hex" title={c.recipient ?? c.pubKey}>
                      {c.recipient ? `${c.recipient.slice(0, 12)}...${c.recipient.slice(-6)}` : "-"}
                    </code>
                  </td>
                  <td>
                    <Hex value={c.operator} />
                  </td>
                  <td>
                    {participations ? (
                      <span className={`badge ${joined ? "badge-soft-success chip chip-ok" : "badge-soft-secondary chip"} px-2 py-1`}>{joined ? t("common.yes") : t("common.no")}</span>
                    ) : (
                      <span className={`badge ${c.frozen ? "badge-soft-success chip chip-ok" : "badge-soft-secondary chip"} px-2 py-1`}>{c.frozen ? t("enrol.frozen") : t("enrol.notFrozen")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  return (
    <div>
      <p className="mb-0 d-flex flex-wrap align-items-center gap-2">
        {frozen ? (
          <>
            <span>
              {t("frozen.count")}: <strong data-testid="chain-count">{count}</strong>, {t("frozen.announced").toLowerCase()}: <strong data-testid="announced-count">{announced}</strong>
            </span>
            <span className={`badge ${match ? "badge-soft-success" : "badge-soft-danger"} px-2 py-1`}>{match ? t("frozen.match") : t("frozen.mismatch")}</span>
          </>
        ) : (
          <span className="text-muted">
            {t("frozen.notYet")} {t("frozen.announced")}: <strong data-testid="announced-count">{announced}</strong>
          </span>
        )}
      </p>
      {selectable ? (
        <div className="mt-3">{table}</div>
      ) : inline ? (
        <div className="mt-3">
          {listRoot && frozen ? (
            <p className="mb-2">
              {t("frozen.fingerprint")} <span className="text-muted">({t("enrol.listRoot")})</span>: <Hex value={listRoot} head={10} tail={8} />
            </p>
          ) : null}
          {table}
        </div>
      ) : (
        <VerifyDetails>
          {listRoot && frozen ? (
            <p className="mb-2">
              {t("frozen.fingerprint")} <span className="text-muted">({t("enrol.listRoot")})</span>: <Hex value={listRoot} head={10} tail={8} />
            </p>
          ) : null}
          {table}
        </VerifyDetails>
      )}
    </div>
  );
}

export interface TimelineItem {
  label: string;
  atMs: number;
  /** Technical round number, shown small. */
  round?: number;
  state: StepState;
  note?: ReactNode;
}

/** Osen activity timeline (timeline-alt) of dated milestones: passed, next, later. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  const { t, locale } = useI18n();
  const icon = { done: "ti-check bg-success-subtle text-success", current: "ti-clock bg-primary-subtle text-primary", future: "ti-hourglass bg-light text-muted" } as const;
  return (
    <div className="timeline-alt py-0">
      {items.map((it, i) => (
        <div className="timeline-item" key={i}>
          <i className={`ti ${icon[it.state]} timeline-icon`} aria-hidden="true" />
          <div className="timeline-item-info">
            <span className="fw-semibold d-block mb-1">
              {it.label}{" "}
              {it.state === "done" ? <span className="badge badge-soft-success ms-1">{t("timeline.passed")}</span> : it.state === "current" ? <span className="badge badge-soft-primary ms-1">{t("timeline.next")}</span> : null}
            </span>
            {it.note ? <span className="d-block mb-1">{it.note}</span> : null}
            <p className="mb-0 pb-3">
              <small className="text-muted tabular">
                {new Date(it.atMs).toLocaleTimeString(locale)}
                {it.round !== undefined ? ` (${t("timeline.round", { n: it.round })})` : null}
              </small>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Result of the draw: drawn set label in a big avatar, burned sets skipped. Keeps notice classes for tests
 *  (text "Drawn set: A" / "Reserve set R"). */
export function DrawResult({ drawnSet, burned, setCount, reserve, testId }: { drawnSet: number; burned: number[]; setCount: number; reserve?: boolean; testId?: string }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const label = setLabel(cfg, drawnSet, setCount);
  return (
    <div className="alert alert-success d-flex align-items-center gap-3 notice notice-ok" role="status" data-testid={testId}>
      <span className="avatar-lg flex-shrink-0">
        <span className="avatar-title text-bg-success rounded-circle fs-24 fw-bold">{label}</span>
      </span>
      <div>
        <strong className="fs-15 d-block">{reserve ? t("draw.reserve", { label }) : t("draw.drawn", { label })}</strong>
        {reserve ? null : <span>{burned.length ? t("draw.burned", { list: burned.map((i) => setLabel(cfg, i)).join(", ") }) : t("draw.noneBurned")}</span>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- No key before the hour */

/** "No key before T", one component for the centre (own key) and the juror (no key): states whether the key
 *  exists, checks the relay for the round (in the details, testid relay-status), and offers one try button.
 *  `attempt` resolves if the paper opened, throws otherwise; a refusal shows as Protected with the reason. */
export function TryOpen({
  round,
  atMs,
  reached,
  buttonLabel,
  attempt,
  explain,
  openedMessage,
  testId = "try-early",
  resultTestId = "too-early",
  statement = true,
  children,
}: {
  round: number;
  /** Epoch ms of the round. */
  atMs: number;
  reached: boolean;
  buttonLabel: string;
  attempt: () => Promise<unknown>;
  /** Wording of a refusal; default explainError. */
  explain?: (e: unknown) => string;
  /** Shown (warning) if the attempt opened the paper. */
  openedMessage: string;
  testId?: string;
  resultTestId?: string;
  /** Show the "No key exists yet" / "The key is public" line (testid no-key before the round). */
  statement?: boolean;
  /** Shown between the statement and the try button (what is being tried, e.g. the juror's download). */
  children?: ReactNode;
}) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const status = useAction<number | null>();
  const act = useAction<{ opened: boolean; message: string; status: number | null }>();

  useEffect(() => {
    void status.run(() => relayStatus(cfg, round));
    // Re-check once when the round is reached.
  }, [cfg, round, reached]);

  const go = () =>
    act.run(async () => {
      const s = await relayStatus(cfg, round);
      try {
        await attempt();
        return { opened: true, message: openedMessage, status: s };
      } catch (e) {
        return { opened: false, message: explain ? explain(e) : explainError(e, t, cfg), status: s };
      }
    });

  const relayLine = (s: number | null | undefined) =>
    s === undefined ? t("common.loading") : s === null ? t("centre.relayDown") : s === 425 ? t("public.relay425", { round }) : t("public.relayStatus", { round, status: s });

  const r = act.result;
  return (
    <div>
      {statement ? (
        reached ? (
          <p className="mb-3">
            <Icon name="lock-keyhole-unlocked-bold-duotone" className="fs-20 text-success me-1 align-middle" />
            {t("tryopen.keyPublic", { time: hm(atMs, locale) })}
          </p>
        ) : (
          <p className="mb-3" data-testid="no-key">
            <Icon name="lock-keyhole-bold-duotone" className="fs-20 text-primary me-1 align-middle" />
            <strong>{t("tryopen.noKey", { time: hm(atMs, locale) })}</strong> <span className="text-muted fs-12">({t("timeline.round", { n: round })})</span>
          </p>
        )
      ) : null}
      {children}
      <Button variant={reached ? "primary" : "secondary"} onClick={() => void go()} busy={act.busy} testId={testId}>
        {buttonLabel}
      </Button>
      <div className="mt-3">
        <ErrorBox error={act.error} cfg={cfg} />
        {r ? (
          r.opened ? (
            <Notice tone="warn" testId={resultTestId}>
              {r.message} {r.status !== null ? t("centre.relaySays", { round, status: r.status }) : null}
            </Notice>
          ) : (
            <Protected testId={resultTestId}>
              {r.message} <span className="text-muted">{r.status !== null ? t("centre.relaySays", { round, status: r.status }) : t("centre.relayDown")}</span>
            </Protected>
          )
        ) : null}
      </div>
      <VerifyDetails>
        <p className="mb-2" data-testid="relay-status">
          {relayLine(status.result)}
        </p>
        <Button variant="secondary" onClick={() => void status.run(() => relayStatus(cfg, round))} busy={status.busy}>
          {t("public.recheck")}
        </Button>
      </VerifyDetails>
    </div>
  );
}

/* ---------------------------------------------------------------- Countdown */

/** Big countdown to a dated milestone (centre and public heroes). role="timer" (not announced every second;
 *  the topbar stepper's live region announces the milestones). */
export function Countdown({ label, atMs, nowMs, reached, reachedLabel, testId = "countdown" }: { label: string; atMs: number; nowMs: number; reached: boolean; reachedLabel: string; testId?: string }) {
  const { t, locale } = useI18n();
  return (
    <div className="d-flex align-items-center gap-3" data-testid={testId}>
      <div className="avatar-xl flex-shrink-0 d-none d-sm-block">
        <span className={`avatar-title rounded-circle fs-42 ${reached ? "bg-success-subtle text-success" : "bg-primary-subtle text-primary"}`}>
          <Icon name={reached ? "lock-keyhole-unlocked-bold-duotone" : "hourglass-bold-duotone"} />
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-muted fs-13 text-uppercase fw-medium mb-1">{label}</h3>
        <p className={`fw-bold tabular mb-0 lh-1 ${reached ? "fs-24 text-success" : "display-5"}`} role="timer">
          {reached ? reachedLabel : formatDuration(atMs - nowMs)}
        </p>
        <p className="text-muted mb-0 mt-2">{t("countdown.at", { time: new Date(atMs).toLocaleTimeString(locale) })}</p>
      </div>
    </div>
  );
}

/** Header of the exam side cards (ExamTimeline here, ExamCard on the office and committee pages). */
export function ExamCardHeader({ id, title, sub }: { id: string; title: string; sub: string }) {
  return (
    <div className="card-header d-flex align-items-center gap-2 border-bottom border-dashed">
      <span className="avatar-sm flex-shrink-0">
        <span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-18">
          <i className="ti ti-calendar-event" aria-hidden="true" />
        </span>
      </span>
      <div className="min-w-0">
        <h2 className="header-title mb-0 text-truncate" id={id}>
          {title}
        </h2>
        <p className="mb-0 text-muted fs-12 text-truncate">{sub}</p>
      </div>
    </div>
  );
}

/** Card with the exam milestones (opening, reveal, reserve) as an Osen timeline. Below a Page with a config. */
export function ExamTimeline() {
  const cfg = useConfig();
  const { t } = useI18n();
  const p = usePhase();
  return (
    <section className="card" aria-labelledby="exam-timeline-title">
      <ExamCardHeader id="exam-timeline-title" title={t("timeline.title")} sub={cfg.demo.examTitle} />
      <div className="card-body">
        {p.milestones.length ? (
          <Timeline items={p.milestones.map((m) => ({ label: t(m.label), atMs: m.atMs, round: m.round, state: m.reached ? "done" : m === p.next ? "current" : "future" }))} />
        ) : (
          <p className="text-muted mb-0">{t("comite.examNotCreated")}</p>
        )}
      </div>
    </section>
  );
}
