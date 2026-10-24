"use client";
// Demo moment before T: try to open now. No key exists yet, the opening fails with TooEarly.
import { openForCentre } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { relayStatus, type BeaconState } from "@/lib/beacon";
import { explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { fetchCentreCiphertext } from "@/lib/packages";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Notice, Section } from "../ui";

export function TryEarly({ snap, setIndex, round, centreId, identity, b }: { snap: ExamSnapshot; setIndex: number; round: number; centreId: string; identity: string; b: BeaconState }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const act = useAction<{ opened: boolean; message: string; status: number | null }>();
  const pkg = snap.packages.find((p) => p.setIndex === setIndex);

  const tryOpen = () =>
    act.run(async () => {
      if (!pkg?.submitted) throw new Error(t("centre.noPackage"));
      const f = await fetchCentreCiphertext(cfg, pkg.uri, centreId, pkg.root);
      const status = await relayStatus(cfg, round);
      try {
        await openForCentre({ ciphertext: f.ciphertext, identity, client: b.client });
        return { opened: true, message: t("centre.openedEarly"), status };
      } catch (e) {
        return { opened: false, message: explainError(e, t, cfg), status };
      }
    });

  return (
    <Section title={t("centre.tryTitle")} id="try-early">
      <p>{t("centre.tryBody")}</p>
      <Button variant="secondary" onClick={() => void tryOpen()} busy={act.busy} testId="try-early">
        {t("centre.tryNow")}
      </Button>
      <ErrorBox error={act.error} cfg={cfg} />
      {act.result ? (
        <Notice tone={act.result.opened ? "warn" : "ok"} testId="too-early">
          {act.result.opened ? null : <strong>{t("centre.refused")} </strong>}
          {act.result.message}{" "}
          {act.result.status !== null ? t("centre.relaySays", { round, status: act.result.status }) : t("centre.relayDown")}
        </Notice>
      ) : null}
    </Section>
  );
}
