"use client";
// Beacon status line and the big countdown to a round.
import { PIN_MISMATCH, type BeaconState } from "@/lib/beacon";
import { formatDuration, formatTime, useI18n } from "@/lib/i18n";
import { roundTime } from "@sealhour/seal";

export function BeaconBar({ b }: { b: BeaconState }) {
  const { t } = useI18n();
  return (
    <p className="d-inline-flex flex-wrap align-items-center gap-2 mb-0" data-testid="beacon-bar">
      <span className="badge badge-soft-primary fs-12">
        <i className="ti ti-clock me-1" aria-hidden="true" />
        {t("beacon.round", { n: b.round })}
      </span>
      <i className={b.relayOnline ? "ti ti-point-filled text-success" : "ti ti-point-filled text-danger"} aria-hidden="true" />
      <span>{b.relayOnline ? t("beacon.relayOn", { n: b.relayRound ?? 0 }) : t("beacon.relayOff")}</span>
      {b.infoSource === "cache" ? <span className="text-muted">{t("beacon.cached")}</span> : null}
      {b.info === null ? <span className="text-muted">{t("beacon.noInfo")}</span> : null}
      {b.infoError === PIN_MISMATCH ? (
        <span className="badge badge-soft-danger chip chip-bad" role="alert" data-testid="beacon-pin-error">
          {t("beacon.pinMismatch")}
        </span>
      ) : null}
    </p>
  );
}

export function Countdown({ b, round, label }: { b: BeaconState; round: number; label: string }) {
  const { t, locale } = useI18n();
  const at = roundTime({ genesis_time: b.genesis, period: b.period } as Parameters<typeof roundTime>[0], round);
  const left = at - b.nowMs;
  const reached = b.round >= round;
  return (
    <div className="card text-center" data-testid="countdown">
      <div className="card-body">
        <div className="text-muted fs-13 text-uppercase fw-semibold">{label}</div>
        <div className={reached ? "fs-1 fw-bold text-success my-2" : "display-3 fw-bold tabular my-2"} role="timer">
          {reached ? t("countdown.reached") : formatDuration(left)}
        </div>
        <p className="mb-0 text-muted">
          {t("countdown.round", { n: round })} {formatTime(at, locale)}
        </p>
      </div>
    </div>
  );
}
