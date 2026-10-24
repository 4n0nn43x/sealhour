"use client";
// "Burn my set": a committee that saw its set circulating before T removes it from the draw.
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import type { BeaconState } from "@/lib/beacon";
import { registry, sendTx, type TxResult } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Notice, Section, TxOutcome } from "../ui";

export function BurnPanel({ snap, setIndex, b, onDone }: { snap: ExamSnapshot; setIndex: number; b: BeaconState; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const tx = useAction<TxResult>();
  const isReserve = setIndex === snap.exam.setCount;
  const burned = snap.packages.find((p) => p.setIndex === setIndex)?.burned ?? false;
  const afterT = b.round >= snap.exam.openRound;

  const burn = () =>
    tx.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      const r = await sendTx(registry(cfg, wallet), "burnSet", [snap.examId, setIndex]);
      onDone();
      return r;
    });

  return (
    <Section title={t("comite.burnTitle")} id="burn" aside={<Chip ok={burned ? false : null}>{burned ? t("comite.burned") : t("comite.notBurned")}</Chip>}>
      <p>{t("comite.burnBody")}</p>
      {isReserve ? <Notice tone="info">{t("comite.burnReserve")}</Notice> : null}
      {afterT && !isReserve ? <Notice tone="warn">{t("comite.burnAfterT")}</Notice> : null}
      <Button variant="danger" onClick={() => void burn()} busy={tx.busy} disabled={burned} testId="burn">
        {t("comite.burn")}
      </Button>
      <ErrorBox error={tx.error} cfg={cfg} />
      <TxOutcome tx={tx.result} />
    </Section>
  );
}
