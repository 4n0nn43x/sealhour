"use client";
// Get the round signature: from the relay, or pasted in base32 (offline: SMS, typed). Verified locally either way.
import { useState } from "react";
import { decodeSignature, encodeSignature, offlineClient } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { fetchRoundSignature, type BeaconState } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Field, Hex, Notice, Section } from "../ui";

export function SignaturePanel({ round, b, onSignature }: { round: number; b: BeaconState; onSignature: (sigHex: string) => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const [mode, setMode] = useState<"relay" | "offline">("relay");
  const [pasted, setPasted] = useState("");
  const act = useAction<string>();
  const reached = b.round >= round;

  const accept = (sig: string) => {
    if (!b.info) throw new Error(t("centre.noInfo"));
    // offlineClient throws BadSignatureError when the signature does not verify for this round.
    offlineClient(b.info, round, sig);
    onSignature(sig);
    return sig;
  };

  const fromRelay = () => act.run(async () => accept(await fetchRoundSignature(b.client, round)));
  const fromPaste = () =>
    act.run(async () => {
      let hex: string;
      try {
        hex = decodeSignature(pasted);
      } catch {
        throw new Error("BadBase32");
      }
      return accept(hex);
    });

  return (
    <Section title={t("centre.sigTitle")} id="signature">
      <div className="nav nav-tabs mb-3" role="tablist" aria-label={t("centre.sigTitle")}>
        <button type="button" role="tab" aria-selected={mode === "relay"} className={mode === "relay" ? "nav-link active" : "nav-link"} onClick={() => setMode("relay")}>
          {t("centre.modeRelay")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "offline"} className={mode === "offline" ? "nav-link active" : "nav-link"} onClick={() => setMode("offline")}>
          {t("centre.modeOffline")}
        </button>
      </div>
      {mode === "relay" ? (
        <>
          <p>{t("centre.relayBody", { round })}</p>
          <Button onClick={() => void fromRelay()} busy={act.busy} disabled={!reached} testId="fetch-signature">
            {t("centre.fetchSig")}
          </Button>
          {!reached ? <p className="form-text">{t("centre.waitRound", { round })}</p> : null}
        </>
      ) : (
        <>
          <p>{t("centre.offlineBody")}</p>
          <Field label={t("centre.pasteLabel")} htmlFor="sig-b32">
            <textarea id="sig-b32" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} className="form-control font-monospace" spellCheck={false} />
          </Field>
          <Button onClick={() => void fromPaste()} busy={act.busy} disabled={!pasted.trim()} testId="paste-signature">
            {t("centre.checkSig")}
          </Button>
          {b.infoSource === "cache" ? <p className="form-text">{t("centre.cachedInfo")}</p> : null}
        </>
      )}
      <ErrorBox error={act.error} cfg={cfg} />
      {act.result ? (
        <div className="vstack gap-1 mt-3" data-testid="signature-ok">
          <Notice tone="ok">
            {t("centre.sigVerified", { round })} <Hex value={act.result} head={10} tail={8} />
          </Notice>
          <Field label={t("centre.sms")} htmlFor="sig-sms">
            <pre id="sig-sms" className="code sms" data-testid="base32">
              {encodeSignature(act.result)}
            </pre>
          </Field>
        </div>
      ) : null}
    </Section>
  );
}
