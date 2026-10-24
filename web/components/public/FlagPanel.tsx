"use client";
// After the reveal: anyone can flag a listed centre on chain, with the hash of the evidence.
import { useEffect, useState } from "react";
import { id as keccakText } from "ethers";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import type { BeaconState } from "@/lib/beacon";
import { nodeSigner, registry, sendTx, type TxResult } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Hex, Notice, Section, TxOutcome } from "../ui";

export function FlagPanel({ snap, b, evidence, suggested }: { snap: ExamSnapshot; b: BeaconState; evidence: string; suggested?: string }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const [centreId, setCentreId] = useState(snap.centres[0]?.centreId ?? "");
  const tx = useAction<TxResult>();
  const revealed = b.round >= snap.exam.revealRound;
  const evidenceHash = keccakText(evidence || "no evidence");

  useEffect(() => {
    if (suggested) setCentreId(suggested);
  }, [suggested]);

  const flag = () =>
    tx.run(async () => {
      const signer = wallet ?? (await nodeSigner(cfg));
      const r = await sendTx(registry(cfg, signer), "flagCentre", [snap.examId, centreId, evidenceHash]);
      return r;
    });

  return (
    <Section title={t("flag.title")} id="flag">
      <p>{t("flag.body")}</p>
      {!revealed ? <Notice tone="info">{t("flag.wait", { round: snap.exam.revealRound })}</Notice> : null}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <label className="d-inline-flex align-items-center gap-2 mb-0">
          {t("flag.centre")}
          <select className="form-select w-auto" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
            {snap.centres.map((c) => (
              <option key={c.centreId} value={c.centreId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <span className="text-muted">
          {t("flag.evidence")} <Hex value={evidenceHash} />
        </span>
      </div>
      <Button variant="danger" onClick={() => void flag()} busy={tx.busy} disabled={!centreId} testId="flag">
        {t("flag.button")}
      </Button>
      {!wallet ? <p className="form-text">{t("flag.jurorSigner")}</p> : null}
      <ErrorBox error={tx.error} cfg={cfg} />
      <TxOutcome tx={tx.result} />
    </Section>
  );
}
