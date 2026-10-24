"use client";
// Home: "Who are you?" role cards with a "Do this now" hint from the exam phase, the exam status, How it works.
import Link from "next/link";
import { useState } from "react";
import { Page, SetupMessage } from "@/components/Shell";
import { useApp, useConfig } from "@/components/Providers";
import { DUE, KIND } from "@/components/Header";
import { Icon } from "@/components/Icon";
import { ExamTimeline } from "@/components/blocks";
import { ErrorBox } from "@/components/ui";
import type { DictKey } from "@/lib/dict";
import { formatDuration, hm, useI18n, type TFn } from "@/lib/i18n";
import type { RoleKind } from "@/lib/roles";
import { usePhase, type PhaseState } from "@/lib/usePhase";

const KINDS: RoleKind[] = ["office", "committee", "centre", "juror"];

function hint(kind: RoleKind, p: PhaseState, t: TFn, time: (ms: number) => string): string {
  const open = p.milestones.find((m) => m.key === "open");
  const reserve = p.milestones.find((m) => m.key === "reserveOpen");
  switch (kind) {
    case "office":
      return t(p.phase === "setup" ? "home.hint.office.setup" : "home.hint.office.done");
    case "committee":
      if (p.phase === "setup") return t("home.hint.committee.setup");
      if (p.phase !== "sealing") return t("home.hint.committee.after");
      return p.sealed < p.packages ? t("home.hint.committee.sealing", { n: p.sealed, m: p.packages }) : t("home.hint.committee.allSealed");
    case "centre":
      if (p.phase === "setup" || !open) return t("home.hint.committee.setup");
      if (p.phase === "sealing") return t("home.hint.centre.before", { time: time(open.atMs) });
      if (p.phase === "open") return t("home.hint.centre.open");
      if (p.phase === "revealed") return t("home.hint.centre.revealed", { time: reserve ? time(reserve.atMs) : "-" });
      return t("home.hint.centre.reserve");
    default:
      return t(p.phase === "reserve" ? "home.hint.public.revealed" : (`home.hint.public.${p.phase}` as DictKey));
  }
}

function RoleCards({ p }: { p: PhaseState | null }) {
  const { t, locale } = useI18n();
  const time = (ms: number) => hm(ms, locale);
  const due = p?.snap ? DUE[p.phase] : null;
  return (
    <ul className="row row-cols-md-2 row-cols-1 list-unstyled mb-0" aria-label={t("home.who")}>
      {KINDS.map((k) => {
        const K = KIND[k];
        const isDue = due === k;
        return (
          <li key={k} className="col d-flex">
            <div className={`card role-card position-relative w-100 ${isDue ? "is-due" : ""}`}>
              <div className="card-body">
                <div className="d-flex align-items-start gap-3">
                  <div className="avatar-lg bg-primary bg-opacity-10 rounded flex-shrink-0">
                    <span className="avatar-title text-primary fs-32">
                      <Icon name={K.icon} />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h2 className="card-title fs-16 fw-semibold mb-1">{t(K.title)}</h2>
                    <p className="text-muted mb-0">{t(K.sub)}</p>
                  </div>
                </div>
                {p?.snap ? (
                  <p className={`mt-3 mb-0 ${isDue ? "text-body fw-medium" : "text-muted"}`}>
                    {isDue ? <span className="badge badge-soft-success px-2 py-1 me-2">{t("home.doNow")}</span> : <i className="ti ti-point-filled me-1 text-primary" aria-hidden="true" />}
                    {hint(k, p, t, time)}
                  </p>
                ) : null}
              </div>
              <div className="card-footer border-top border-dashed mt-auto">
                <Link href={K.href} className="link-primary fw-medium stretched-link">
                  {t("home.go", { page: t(K.title) })} <i className="ti ti-arrow-right" aria-hidden="true" />
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function ExamStatus() {
  const cfg = useConfig();
  const { t } = useI18n();
  const p = usePhase();
  const e = p.snap?.exam;
  const order = ["setup", "sealing", "open", "revealed", "reserve"] as const;
  const at = order.indexOf(p.phase);
  const labels: DictKey[] = ["phase.listFrozen", "phase.sealing", "phase.opening", "phase.reveal", "phase.reserve"];
  const strip: { label: string; value: string; icon: string; tone: string }[] = [
    { label: t("home.statCentres"), value: e?.frozen ? `${e.centreCount} / ${cfg.demo.announcedCentreCount}` : "-", icon: "ti-building", tone: "text-primary" },
    { label: t("home.statSealed"), value: p.packages ? `${p.sealed} / ${p.packages}` : "-", icon: "ti-lock", tone: "text-success" },
    { label: t("home.statBurned"), value: e?.created ? String(p.burned.length) : "-", icon: "ti-flame", tone: "text-danger" },
    { label: p.next ? t(p.next.label) : t("home.statNext"), value: p.next ? formatDuration(p.leftMs) : "-", icon: "ti-hourglass", tone: "text-warning" },
  ];
  return (
    <div className="card">
      <div className="card-header d-flex justify-content-between align-items-center border-bottom border-dashed">
        <h2 className="header-title">{t("home.statusTitle")}</h2>
        <span className="badge badge-soft-primary px-2 py-1 fs-12">{t(`phase.${p.phase}` as DictKey)}</span>
      </div>
      <div className="px-4 px-sm-5 pt-2">
        <div className="horizontal-steps mt-3 mb-3 pb-4" aria-hidden="true">
          <div className="horizontal-steps-content">
            {labels.map((l, i) => (
              <div key={l} className={`step-item ${i === at ? "current" : ""}`}>
                <span>{t(l)}</span>
              </div>
            ))}
          </div>
          <div className="process-line" style={{ width: `${(at / (labels.length - 1)) * 100}%` }} />
        </div>
      </div>
      <div className="bg-light bg-opacity-50">
        <div className="row text-center g-0">
          {strip.map((s) => (
            <div key={s.label} className="col-md-3 col-6">
              <p className="text-muted mt-3 mb-1">{s.label}</p>
              <p className="h4 mb-3 tabular">
                <i className={`ti ${s.icon} ${s.tone} me-1`} aria-hidden="true" />
                {s.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="header-title">
          <button type="button" className="btn btn-link link-reset p-0 fs-16 fw-semibold text-decoration-none d-flex align-items-center gap-2" aria-expanded={open} aria-controls="how-body" onClick={() => setOpen(!open)}>
            <Icon name="info-circle-bold-duotone" className="fs-22 text-primary" />
            {t("home.howTitle")}
            <i className={`ti ti-chevron-${open ? "up" : "down"}`} aria-hidden="true" />
          </button>
        </h2>
      </div>
      <div className="card-body pt-0" id="how-body" hidden={!open}>
        <ol className="mb-0 ps-3 vstack gap-2">
          <li>{t("home.how1")}</li>
          <li>{t("home.how2")}</li>
          <li>{t("home.how3")}</li>
        </ol>
      </div>
    </div>
  );
}

function Loaded() {
  const cfg = useConfig();
  const p = usePhase();
  return (
    <>
      <ErrorBox error={p.error} cfg={cfg} />
      <div className="row">
        <div className="col-xl-8">
          <RoleCards p={p} />
        </div>
        <div className="col-xl-4">
          <ExamTimeline />
          <HowItWorks />
        </div>
      </div>
      <ExamStatus />
    </>
  );
}

export default function Home() {
  const { t } = useI18n();
  const { config } = useApp();
  return (
    <Page title={t("home.who")} intro={t("home.whoIntro")} needsConfig={false}>
      {config?.status === "ok" ? (
        <Loaded />
      ) : (
        <>
          <RoleCards p={null} />
          {config?.status === "missing" ? <SetupMessage /> : null}
          {config?.status === "invalid" ? <SetupMessage reason={config.message} /> : null}
        </>
      )}
    </Page>
  );
}
