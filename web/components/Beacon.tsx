"use client";
// Beacon status line and the big countdown to a round.
import { PIN_MISMATCH, type BeaconState } from "@/lib/beacon";
import { formatDuration, formatTime, useI18n } from "@/lib/i18n";
import { roundTime } from "@sealhour/seal";

export function BeaconBar({ b }: { b: BeaconState }) {
  const { t } = useI18n();
  return (
    <p className="beacon-bar" data-testid="beacon-bar">
      <span>{t("beacon.round", { n: b.round })}</span>
      <span className={b.relayOnline ? "dot dot-ok" : "dot dot-bad"} aria-hidden="true" />
      <span>{b.relayOnline ? t("beacon.relayOn", { n: b.relayRound ?? 0 }) : t("beacon.relayOff")}</span>
      {b.infoSource === "cache" ? <span className="muted">{t("beacon.cached")}</span> : null}
      {b.info === null ? <span className="muted">{t("beacon.noInfo")}</span> : null}
      {b.infoError === PIN_MISMATCH ? (
        <span className="chip chip-bad" role="alert" data-testid="beacon-pin-error">
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
    <div className={`countdown ${reached ? "countdown-done" : ""}`} data-testid="countdown">
      <div className="countdown-label">{label}</div>
      <div className="countdown-value" role="timer">{reached ? t("countdown.reached") : formatDuration(left)}</div>
      <div className="countdown-sub">
        {t("countdown.round", { n: round })} {formatTime(at, locale)}
      </div>
    </div>
  );
}
