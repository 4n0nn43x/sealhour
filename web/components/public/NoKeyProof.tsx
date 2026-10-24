"use client";
// Before T: the proof that no key exists. The relay refuses the opening round (HTTP 425).
import { useEffect } from "react";
import { useConfig } from "../Providers";
import { relayStatus, type BeaconState } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { useAction } from "@/lib/useAction";
import { Button, Notice, Section } from "../ui";

export function NoKeyProof({ round, b }: { round: number; b: BeaconState }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const check = useAction<number | null>();
  const before = b.round < round;

  useEffect(() => {
    void check.run(() => relayStatus(cfg, round));
    // Re-check once when the round is reached.
  }, [cfg, round, before]);

  const status = check.result;
  return (
    <Section title={t("public.proofTitle")} id="proof">
      {before ? (
        <Notice tone="info" testId="no-key">
          <strong>{t("public.noKey", { round })}</strong>
        </Notice>
      ) : (
        <Notice tone="ok">{t("public.roundSigned", { round })}</Notice>
      )}
      <p data-testid="relay-status">
        {status === undefined
          ? t("common.loading")
          : status === null
            ? t("centre.relayDown")
            : status === 425
              ? t("public.relay425", { round })
              : t("public.relayStatus", { round, status })}
      </p>
      <Button variant="secondary" onClick={() => void check.run(() => relayStatus(cfg, round))} busy={check.busy}>
        {t("public.recheck")}
      </Button>
    </Section>
  );
}
