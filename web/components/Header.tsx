"use client";
// Topbar building blocks: the exam PhaseStepper (with its clock popover), the ActingAs role chip and picker,
// and RolePicker (a plain committee or centre select for pages). Role keys: office, committee-N, centre-N, juror.
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "./Providers";
import { BeaconBar } from "./Beacon";
import { Icon, type IconName } from "./Icon";
import type { DictKey } from "@/lib/dict";
import { formatDuration, hm, useI18n, type TFn } from "@/lib/i18n";
import type { Role, RoleKind } from "@/lib/roles";
import { usePhase, type Phase } from "@/lib/usePhase";

/** Page, icon and names of each role kind. */
export const KIND: Record<RoleKind, { href: string; icon: IconName; ti: string; title: DictKey; sub: DictKey }> = {
  office: { href: "/enrolment/", icon: "buildings-2-bold-duotone", ti: "ti-building-community", title: "who.office", sub: "who.officeSub" },
  committee: { href: "/committee/", icon: "users-group-rounded-bold-duotone", ti: "ti-users-group", title: "who.committee", sub: "who.committeeSub" },
  centre: { href: "/centre/", icon: "square-academic-cap-bold-duotone", ti: "ti-school", title: "who.centre", sub: "who.centreSub" },
  juror: { href: "/public/", icon: "global-bold-duotone", ti: "ti-world", title: "who.public", sub: "who.publicSub" },
};

/** The role kind whose work is due in each phase (sidenav "now" badge, home "Do this now"). */
export const DUE: Record<Phase, RoleKind> = { setup: "office", sealing: "committee", open: "centre", revealed: "juror", reserve: "centre" };

export function roleName(r: Role, t: TFn): string {
  if (r.kind === "office") return t("role.office");
  if (r.kind === "committee") return t("role.committee", { label: r.name });
  if (r.kind === "centre") return t("role.centre", { name: r.name });
  return t("who.publicNoKey");
}

/** Open state for a small menu or popover: focus moves into it on open (the active item, else the first control);
 *  closes on outside click and Escape (focus back on the toggle). */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const menu = ref.current?.querySelector<HTMLElement>(".dropdown-menu");
    (menu?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? menu?.querySelector<HTMLElement>("button, select, a[href]"))?.focus();
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      ref.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

type StepState = "done" | "current" | "future";

/** Horizontal exam stepper for the topbar: List frozen, Sealed n/m, Opening, Reveal, Reserve; countdown to the next one. */
export function PhaseStepper() {
  const { t, locale } = useI18n();
  const p = usePhase();
  const pop = usePopover();
  const e = p.snap?.exam;
  const order: Phase[] = ["setup", "sealing", "open", "revealed", "reserve"];
  const at = order.indexOf(p.phase);
  const time = (ms: number) => hm(ms, locale);
  const ms = Object.fromEntries(p.milestones.map((m) => [m.key, m]));
  const when = (key: string): string | undefined => {
    const m = ms[key];
    if (!m) return undefined;
    if (m.reached) return t("phase.at", { time: time(m.atMs) });
    return p.next?.key === key ? t("phase.in", { time: formatDuration(p.leftMs) }) : t("phase.at", { time: time(m.atMs) });
  };
  // Chain down or snapshot not loaded: no step is claimed as done or current.
  const state = (i: number, done: boolean): StepState => (p.unknown ? "future" : done ? "done" : i === at ? "current" : "future");
  const unknownLine = p.unknown ? (p.loading && !p.snap ? t("common.loading") : t("phase.unreachable")) : null;
  const steps: { label: string; sub?: string; state: StepState }[] = [
    { label: t("phase.listFrozen"), state: state(0, Boolean(e?.frozen && e.created)) },
    { label: t("phase.sealed", { n: p.sealed, m: p.packages || "-" }), state: state(1, at > 1) },
    { label: t("phase.opening"), sub: when("open"), state: state(2, at > 2) },
    { label: t("phase.reveal"), sub: when("reveal"), state: state(3, at > 3) },
    { label: t("phase.reserve"), sub: when("reserveOpen"), state: state(4, Boolean(ms.reserveReveal?.reached)) },
  ];
  // On phones only the current step shows: its second line carries the countdown to the next milestone.
  const current = p.next ? `${t(p.next.label)} ${t("phase.in", { time: formatDuration(p.leftMs) })}` : t(`phase.${p.phase}` as DictKey);
  const live = unknownLine ?? `${t("phase.now", { phase: t(`phase.${p.phase}` as DictKey) })} ${p.next ? t("phase.nextAt", { label: t(p.next.label), time: time(p.next.atMs) }) : ""}`;

  return (
    <div className="phase-stepper d-flex align-items-center gap-2 position-relative min-w-0" ref={pop.ref}>
      <ol className="d-flex align-items-center list-unstyled mb-0 gap-2 min-w-0" aria-label={t("phase.aria")}>
        {steps.map((s, i) => (
          <li key={i} className={`phase-step min-w-0 phase-${s.state} ${s.state === "current" ? "d-flex" : "d-none d-xl-flex"}`} aria-current={s.state === "current" ? "step" : undefined}>
            {i > 0 ? <span className="phase-line d-none d-xl-block" aria-hidden="true" /> : null}
            <span className="phase-dot avatar-xs flex-shrink-0">
              <span className="avatar-title rounded-circle fs-12 fw-semibold">{s.state === "done" ? <i className="ti ti-check" aria-hidden="true" /> : i + 1}</span>
            </span>
            <span className="d-flex flex-column lh-sm min-w-0">
              <span className="fw-medium text-truncate">{s.label}</span>
              <span className="fs-12 text-muted text-truncate tabular">{s.state === "done" ? (
                  t("phase.done")
                ) : s.state === "current" ? (
                  <>
                    <span className="d-xl-none">{current}</span>
                    <span className="d-none d-xl-inline">{t(`phase.${p.phase}` as DictKey)}</span>
                  </>
                ) : (
                  s.sub ?? t("phase.waiting")
                )}</span>
            </span>
          </li>
        ))}
      </ol>
      {unknownLine ? (
        <span className="badge badge-soft-warning px-2 py-1 flex-shrink-0" title={unknownLine} data-testid="phase-unknown">
          {/* Icon only on phones and next to the full stepper (xl) when narrow; the title and the live region carry the text. */}
          <i className="ti ti-plug-connected-x me-sm-1 me-xl-0 me-xxl-1" aria-hidden="true" />
          <span className="d-none d-sm-inline d-xl-none d-xxl-inline">{unknownLine}</span>
        </span>
      ) : null}
      <span className="visually-hidden" aria-live="polite">
        {live}
      </span>
      <div className="topbar-item flex-shrink-0">
      <button
          type="button"
          className="topbar-link"
          aria-expanded={pop.open}
          aria-haspopup="dialog"
          aria-label={t("phase.details")}
          title={t("phase.details")}
          onClick={() => pop.setOpen(!pop.open)}
          data-testid="phase-details"
        >
          <i className="ti ti-info-circle fs-20" aria-hidden="true" />
        </button>
      </div>
      {pop.open ? (
        <div className="dropdown-menu dropdown-menu-end dropdown-menu-lg show p-3 phase-pop" role="dialog" aria-label={t("phase.details")}>
          <p className="fw-semibold mb-2">{t("phase.details")}</p>
          <BeaconBar b={p.b} />
          {p.milestones.length ? (
            <ul className="list-unstyled fs-12 text-muted my-2">
              {p.milestones.map((m) => (
                <li key={m.key} className="d-flex justify-content-between gap-2">
                  <span>{t(m.label)}</span>
                  <span className="tabular">
                    {t("timeline.round", { n: m.round })}, {time(m.atMs)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="btn btn-sm btn-soft-primary mt-1" onClick={p.reload} data-testid="refresh">
            <i className="ti ti-refresh me-1" aria-hidden="true" />
            {t("common.reload")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Topbar chip showing who is acting; opens the grouped role picker. Picking a role routes to its page.
 *  The select inside (data-testid="role") changes the signer only, staying on the page. */
export function ActingAs() {
  const { t } = useI18n();
  const { roles, role, setRole } = useApp();
  const router = useRouter();
  const path = usePathname() ?? "/";
  const pop = usePopover();
  if (!role) return null;
  const k = KIND[role.kind];
  const pick = (r: Role) => {
    setRole(r.key);
    pop.setOpen(false);
    if (!path.startsWith(KIND[r.kind].href.slice(0, -1))) router.push(KIND[r.kind].href);
    // Same page: the menu closes under the focused item, so focus goes back to the chip.
    else pop.ref.current?.querySelector<HTMLElement>("[aria-expanded]")?.focus();
  };
  const group = (kind: RoleKind, title: DictKey, compact = false): ReactNode => {
    const list = roles.filter((r) => r.kind === kind);
    return (
      <div className="mb-2">
        <div className="dropdown-header px-0 pt-0 text-uppercase fs-11 fw-semibold">{t(title)}</div>
        <div className={compact ? "d-flex flex-wrap gap-1" : "vstack gap-1"}>
          {list.map((r) => {
            const active = r.key === role.key;
            return compact ? (
              <button key={r.key} type="button" className={`btn btn-sm btn-icon ${active ? "btn-primary" : "btn-soft-primary"}`} aria-pressed={active} onClick={() => pick(r)} title={roleName(r, t)} aria-label={roleName(r, t)}>
                {r.name}
              </button>
            ) : (
              <button key={r.key} type="button" className={`dropdown-item d-flex align-items-center gap-2 ${active ? "active" : ""}`} aria-pressed={active} onClick={() => pick(r)}>
                <i className={`ti ${KIND[kind].ti} fs-16`} aria-hidden="true" />
                {kind === "juror" ? t("who.publicNoKey") : kind === "office" ? t("who.office") : r.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  return (
    <div className="topbar-item nav-user position-relative" ref={pop.ref}>
      <button
        type="button"
        className="topbar-link dropdown-toggle drop-arrow-none px-2 d-flex align-items-center gap-2"
        aria-expanded={pop.open}
        aria-haspopup="true"
        onClick={() => pop.setOpen(!pop.open)}
        data-testid="acting-as"
        title={t("actor.change")}
      >
        <span className="avatar-sm flex-shrink-0">
          <span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-20">
            <Icon name={k.icon} />
          </span>
        </span>
        <span className="d-none d-lg-flex flex-column gap-1 text-start">
          <span className="fs-11 text-muted lh-1">{t("actor.label")}</span>
          <span className="fw-semibold text-body lh-1" data-testid="acting-as-name">
            {roleName(role, t)}
          </span>
        </span>
        <i className="ti ti-chevron-down d-none d-lg-block ms-1" aria-hidden="true" />
        <span className="visually-hidden d-lg-none">{`${t("actor.label")} ${roleName(role, t)}`}</span>
      </button>
      <div className={`dropdown-menu dropdown-menu-end p-3 acting-menu ${pop.open ? "show" : ""}`} data-bs-popper="static">
        {group("office", "actor.groupOffice")}
        {group("committee", "actor.groupCommittees", true)}
        {group("centre", "actor.groupCentres")}
        {group("juror", "actor.groupPublic")}
        <div className="dropdown-divider my-2" />
        <RolePicker label={t("actor.signAs")} testId="role" />
      </div>
    </div>
  );
}

/** Select of the roles of the given kinds (all by default). Changes the actor, never the page.
 *  Option values: office, committee-N, centre-N, juror. Test ids: role-committee, role-centre (from kinds) or testId. */
export function RolePicker({ kinds, testId, label }: { kinds?: RoleKind[]; testId?: string; label?: string }) {
  const { roles, role, setRole } = useApp();
  const { t } = useI18n();
  const list = kinds ? roles.filter((r) => kinds.includes(r.kind)) : roles;
  if (list.length === 0) return null;
  const value = role && list.some((r) => r.key === role.key) ? role.key : "";
  const id = `picker-${testId ?? (kinds ?? ["all"]).join("-")}`;
  return (
    <div className="d-flex flex-column gap-1">
      <label className="form-label mb-0 fs-12 text-muted" htmlFor={id}>
        {label ?? t("role.label")}
      </label>
      <select id={id} className="form-select form-select-sm" value={value} onChange={(e) => setRole(e.target.value)} data-testid={testId ?? (kinds ? `role-${kinds.join("-")}` : "role")}>
        {value === "" ? <option value="">{t("role.choose")}</option> : null}
        {list.map((r) => (
          <option key={r.key} value={r.key}>
            {roleName(r, t)}
          </option>
        ))}
      </select>
    </div>
  );
}
