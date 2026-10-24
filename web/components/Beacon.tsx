"use client";
// Beacon status line (the phase stepper's details popover). The countdown is Countdown in blocks.tsx.
import { PIN_MISMATCH, type BeaconState } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";

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
