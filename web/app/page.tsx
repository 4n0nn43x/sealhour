"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Page } from "@/components/Shell";
import { useApp, useConfig } from "@/components/Providers";
import { useBeacon } from "@/lib/beacon";
import { formatDuration, formatTime, useI18n } from "@/lib/i18n";
import { burnedIndexes, submittedIndexes } from "@/lib/registry";
import { useSnapshot } from "@/lib/useSnapshot";
import { roundTime } from "@sealhour/seal";
import { SetupMessage } from "@/components/Shell";
import type { DictKey } from "@/lib/dict";

const SCREENS: { href: string; title: DictKey; body: DictKey; icon: string }[] = [
  { href: "/enrolment/", title: "nav.enrolement", body: "home.enrolement", icon: "ti-building-community" },
  { href: "/committee/", title: "nav.comite", body: "home.comite", icon: "ti-users-group" },
  { href: "/centre/", title: "nav.centre", body: "home.centre", icon: "ti-school" },
  { href: "/public/", title: "nav.public", body: "home.public", icon: "ti-world" },
];

function Stat({ label, icon, value, sub }: { label: string; icon: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="col">
      <div className="card">
        <div className="card-body">
          <div className="text-muted fs-13 text-uppercase fw-semibold">{label}</div>
          <div className="d-flex align-items-center justify-content-center gap-2 my-2 py-1">
            <div className="avatar-md flex-shrink-0">
              <span className="avatar-title text-bg-primary rounded-circle fs-22">
                <i className={`ti ${icon}`} aria-hidden="true" />
              </span>
            </div>
            <div className="h3 mb-0 fw-bold tabular">{value}</div>
          </div>
          <p className="mb-0 text-muted text-truncate">{sub ?? " "}</p>
        </div>
      </div>
    </div>
  );
}

/** Stat cards from the exam's on chain snapshot and the beacon clock (only with a loaded config). */
function Stats() {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const b = useBeacon(cfg);
  const { snap } = useSnapshot(cfg, cfg.demo.examId);
  const e = snap?.exam;
  const next = e ? (b.round < e.openRound ? { key: "rounds.open" as const, round: e.openRound } : { key: "rounds.reveal" as const, round: e.revealRound }) : null;
  const at = next ? roundTime({ genesis_time: b.genesis, period: b.period } as Parameters<typeof roundTime>[0], next.round) : 0;
  return (
    <div className="row row-cols-xxl-4 row-cols-md-2 row-cols-1 text-center">
      <Stat label={t("home.statCentres")} icon="ti-building" value={snap ? snap.centres.length : "-"} sub={`${t("enrol.announced")}: ${cfg.demo.announcedCentreCount}`} />
      <Stat label={t("home.statPackages")} icon="ti-package" value={snap && e?.created ? `${submittedIndexes(snap).length} / ${snap.packages.length}` : "-"} />
      <Stat label={t("home.statBurned")} icon="ti-flame" value={snap && e?.created ? burnedIndexes(snap).length : "-"} />
      <Stat
        label={next ? t("home.statRound", { label: t(next.key), n: next.round }) : t("rounds.open")}
        icon="ti-hourglass"
        value={!next || !e?.created ? "-" : b.round >= next.round ? t("countdown.reached") : formatDuration(at - b.nowMs)}
        sub={next && e?.created ? formatTime(at, locale) : undefined}
      />
    </div>
  );
}

export default function Home() {
  const { t } = useI18n();
  const { config } = useApp();
  return (
    <Page title={t("home.title")} needsConfig={false}>
      {config?.status === "ok" ? <Stats /> : null}
      <div className="card">
        <div className="card-body">
          <ol className="mb-0 ps-3 vstack gap-2">
            <li>{t("home.line1")}</li>
            <li>{t("home.line2")}</li>
            <li>{t("home.line3")}</li>
          </ol>
        </div>
      </div>
      <ul className="row row-cols-1 row-cols-md-2 row-cols-xxl-4 list-unstyled mb-0">
        {SCREENS.map((s) => (
          <li key={s.href} className="col">
            <div className="card card-h-100">
              <div className="card-body">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <span className="avatar-sm flex-shrink-0">
                    <span className="avatar-title bg-primary-subtle text-primary rounded fs-18">
                      <i className={`ti ${s.icon}`} aria-hidden="true" />
                    </span>
                  </span>
                  <h2 className="header-title mb-0">
                    <Link href={s.href} className="link-reset stretched-link">
                      {t(s.title)}
                    </Link>
                  </h2>
                </div>
                <p className="text-muted mb-0">{t(s.body)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {config?.status === "missing" ? <SetupMessage /> : null}
      {config?.status === "invalid" ? <SetupMessage reason={config.message} /> : null}
    </Page>
  );
}
