"use client";
// The verdict card: what the checked text points to, and "Flag this centre" on chain with the hash of the text.
// Public action. Demo: signed by the local node's account (the public holds no key), never by a role's wallet.
// Live: the juror's burner (solo test) or the connected wallet.
import { useEffect, useState } from "react";
import { id as keccakText } from "ethers";
import type { LeakVerdict } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { TxStep, VerifyDetails } from "../blocks";
import { useActor } from "@/lib/actor";
import { nodeSigner, registry, sendTx } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";
import type { ExamSnapshot } from "@/lib/registry";
import { Hex } from "../ui";
import { VerdictView } from "./Verifier";

export function FlagPanel({ snap, revealed, leak }: { snap: ExamSnapshot; revealed: boolean; leak: { text: string; verdict: LeakVerdict | null } | null }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const [centreId, setCentreId] = useState(snap.centres[0]?.centreId ?? "");
  const verdict = leak?.verdict ?? null;
  const evidenceHash = keccakText(leak?.text || "no evidence");

  useEffect(() => {
    if (verdict?.centreId) setCentreId(verdict.centreId);
  }, [verdict?.centreId]);

  const reason = !revealed ? t("publicPage.flagWaitReveal") : !verdict ? t("publicPage.flagNeedVerdict") : undefined;
  return (
    <section className="card" id="flag" aria-labelledby="flag-title">
      <div className="card-header border-bottom border-dashed">
        <h2 className="header-title" id="flag-title">
          {t("publicPage.verdictTitle")}
        </h2>
      </div>
      <div className="card-body">
        {verdict ? <VerdictView v={verdict} snap={snap} /> : <p className="text-muted">{t("publicPage.noVerdict")}</p>}
        <div className="border-top border-dashed pt-3">
          <h3 className="fs-15 fw-semibold mb-1">{t("flag.title")}</h3>
          <p className="text-muted mb-3">{t("flag.body")}</p>
          <TxStep
            label={t("flag.button")}
            variant="danger"
            testId="flag"
            disabled={Boolean(reason) || !centreId}
            disabledReason={reason}
            run={async () => {
              const signer = wallet ?? (cfg.mode === "demo" ? await nodeSigner(cfg) : null);
              if (!signer) throw new Error("NoWallet");
              return sendTx(registry(cfg, signer), "flagCentre", [snap.examId, centreId, evidenceHash]);
            }}
          >
            <div className="mb-3" style={{ maxWidth: 320 }}>
              <label className="form-label" htmlFor="flag-centre">
                {t("flag.centre")}
              </label>
              <select id="flag-centre" className="form-select" value={centreId} onChange={(e) => setCentreId(e.target.value)}>
                {snap.centres.map((c) => (
                  <option key={c.centreId} value={c.centreId}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </TxStep>
          <VerifyDetails>
            <p className="mb-2">
              {t("flag.evidence")} <Hex value={evidenceHash} head={10} tail={8} />
            </p>
            <p className="mb-0">{t(cfg.mode === "live" ? "flag.jurorSignerLive" : "flag.jurorSigner")}</p>
          </VerifyDetails>
        </div>
      </div>
    </section>
  );
}
