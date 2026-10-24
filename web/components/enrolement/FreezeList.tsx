"use client";
// The exam's centre list: frozen state, list root and count against the announced count; freeze action.
import { useEffect, useState } from "react";
import { listRoot } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import { registry, sendTx, type TxResult } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";
import type { CentreInfo, ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Hex, Notice, Section, TxOutcome } from "../ui";
import { CentresTable } from "./CentresTable";

export function FreezeList({ snap, all, onDone }: { snap: ExamSnapshot; all: CentreInfo[]; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const tx = useAction<TxResult>();
  const announced = cfg.demo.announcedCentreCount;
  const frozen = snap.exam.frozen;
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    // Default selection: the demo centres that are registered.
    const demoIds = cfg.demo.centres.map((c) => c.centreId.toLowerCase());
    setSelected(all.filter((c) => demoIds.includes(c.centreId.toLowerCase())).map((c) => c.centreId));
  }, [all, cfg]);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const root = selected.length > 0 ? listRoot(selected) : null;

  const freeze = () =>
    tx.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      const r = await sendTx(registry(cfg, wallet), "freezeCentres", [snap.examId, selected, root, selected.length]);
      onDone();
      return r;
    });

  return (
    <Section title={t("enrol.freezeTitle")} id="freeze" aside={<Chip ok={frozen}>{frozen ? t("enrol.listFrozen") : t("enrol.listOpen")}</Chip>}>
      <dl className="kv">
        <dt>{t("enrol.announced")}</dt>
        <dd data-testid="announced-count">{announced}</dd>
        <dt>{t("enrol.onChainCount")}</dt>
        <dd data-testid="chain-count">{frozen ? snap.exam.centreCount : "-"}</dd>
        <dt>{t("enrol.listRoot")}</dt>
        <dd>{frozen ? <Hex value={snap.exam.listRoot} head={10} tail={8} /> : "-"}</dd>
      </dl>
      {frozen ? (
        <>
          {snap.exam.centreCount !== announced ? <Notice tone="error">{t("enrol.countMismatch")}</Notice> : null}
          <CentresTable centres={snap.centres} />
        </>
      ) : (
        <>
          <p>{t("enrol.pickCentres")}</p>
          <CentresTable centres={all} selectable selected={selected} onToggle={toggle} />
          <p className="muted">
            {t("enrol.selectedCount", { n: selected.length })} {root ? <Hex value={root} head={10} tail={8} /> : null}
          </p>
          {selected.length !== announced ? <Notice tone="warn">{t("enrol.selectedMismatch", { n: announced })}</Notice> : null}
        </>
      )}
      <Button onClick={() => void freeze()} busy={tx.busy} disabled={frozen || selected.length === 0} testId="freeze" title={frozen ? t("enrol.alreadyFrozen") : undefined}>
        {t("enrol.freeze")}
      </Button>
      {frozen ? <p className="hint">{t("enrol.alreadyFrozen")}</p> : null}
      <ErrorBox error={tx.error} cfg={cfg} />
      <TxOutcome tx={tx.result} />
    </Section>
  );
}
