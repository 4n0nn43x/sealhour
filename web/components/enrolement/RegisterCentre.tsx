"use client";
// Office form: register (or update, until frozen) a centre with its X25519 key and operator.
import { useState } from "react";
import { isAddress } from "ethers";
import { generateCentreKey, recipientToBytes32 } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import { registry, sendTx, type TxResult } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";
import { toBytes32Id } from "@/lib/ids";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Field, Hex, Notice, Section, TxOutcome } from "../ui";

export function RegisterCentre({ onDone }: { onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { wallet } = useActor();
  const [name, setName] = useState("");
  const [operator, setOperator] = useState("");
  const [recipient, setRecipient] = useState("");
  const [identity, setIdentity] = useState<string | null>(null);
  const gen = useAction<void>();
  const tx = useAction<TxResult>();

  const centreId = name.trim() ? toBytes32Id(`centre:${name.trim()}`) : "";
  let keyHex: string | null = null;
  let keyError: string | null = null;
  if (recipient.trim()) {
    try {
      keyHex = recipientToBytes32(recipient);
    } catch (e) {
      keyError = (e as Error).message;
    }
  }
  const valid = Boolean(name.trim() && isAddress(operator) && keyHex);

  const generate = () =>
    gen.run(async () => {
      const k = await generateCentreKey();
      setRecipient(k.recipient);
      setIdentity(k.identity);
    });

  const submit = () =>
    tx.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      const r = await sendTx(registry(cfg, wallet), "registerCentre", [centreId, keyHex, operator, name.trim()]);
      onDone();
      return r;
    });

  return (
    <Section title={t("enrol.registerTitle")} id="register">
      <div className="grid-2">
        <Field label={t("common.name")} htmlFor="c-name">
          <input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Westbrook" />
        </Field>
        <Field label={t("common.operator")} htmlFor="c-op" hint={t("enrol.operatorHint")}>
          <input id="c-op" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="0x..." list="demo-operators" />
          <datalist id="demo-operators">
            {cfg.demo.centres.map((c) => (
              <option key={c.address} value={c.address}>
                {c.name}
              </option>
            ))}
          </datalist>
        </Field>
      </div>
      <Field label={t("enrol.recipient")} htmlFor="c-key" hint={t("enrol.recipientHint")}>
        <div className="row">
          <input id="c-key" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="age1..." className="grow" />
          <Button variant="secondary" onClick={() => void generate()} busy={gen.busy}>
            {t("enrol.generateKey")}
          </Button>
        </div>
      </Field>
      {keyError ? <Notice tone="warn">{t("enrol.badRecipient")}</Notice> : null}
      {identity ? (
        <Notice tone="warn">
          {t("enrol.identityWarning")}
          <pre className="code wrap-anywhere">{identity}</pre>
        </Notice>
      ) : null}
      <ErrorBox error={gen.error} cfg={cfg} />
      {centreId ? (
        <p className="muted">
          {t("enrol.centreId")} <Hex value={centreId} />
        </p>
      ) : null}
      <Button onClick={() => void submit()} busy={tx.busy} disabled={!valid} testId="register-centre">
        {t("enrol.register")}
      </Button>
      <ErrorBox error={tx.error} cfg={cfg} />
      <TxOutcome tx={tx.result} />
    </Section>
  );
}
