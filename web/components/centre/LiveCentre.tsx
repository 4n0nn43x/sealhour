"use client";
// Live mode only, before the opening: the centre's own key (generated on this device, downloadable, importable,
// published with setCentreKey before the list is frozen) and joining the exam (joinExam with a fresh r_c).
// The demo seeds both, so its centre page starts at the device check.
import { useEffect, useState, type ChangeEvent } from "react";
import { identityToRecipient } from "age-encryption";
import { toUtf8Bytes } from "ethers";
import { commitRc, generateCentreKey, newRc, recipientToBytes32, tlockRc } from "@sealhour/seal";
import { useApp, useConfig } from "../Providers";
import { Step, TxStep, VerifyDetails } from "../blocks";
import { Button, ErrorBox, Field, Hex, Notice } from "../ui";
import { useActor } from "@/lib/actor";
import { readCentre, type CentreInfo, type ExamSnapshot } from "@/lib/registry";
import { registry, sendTx } from "@/lib/chain";
import type { DemoCentre } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { centreRc, saveCentreIdentity, saveCentreRc } from "@/lib/live";
import { downloadText } from "@/lib/packages";
import { useAction } from "@/lib/useAction";
import type { BeaconState } from "@/lib/beacon";

/** joinExam caps tlockedRc (SealRegistry MAX_TLOCKED_RC). */
const MAX_TLOCKED_RC = 1024;

export function CentreKeyStep({ centre }: { centre: DemoCentre }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { live } = useApp();
  const { wallet } = useActor();
  const [chain, setChain] = useState<CentreInfo | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [tick, setTick] = useState(0);
  const act = useAction<void>();

  useEffect(() => {
    let alive = true;
    readCentre(cfg, centre.centreId)
      .then((c) => alive && setChain(c))
      .catch(() => alive && setChain(null));
    return () => {
      alive = false;
    };
  }, [cfg, centre.centreId, tick]);
  useEffect(() => {
    let alive = true;
    setMine(null);
    if (centre.identity) identityToRecipient(centre.identity).then((r) => alive && setMine(r), () => alive && setMine(null));
    return () => {
      alive = false;
    };
  }, [centre.identity]);

  const registered = Boolean(chain && chain.operator.toLowerCase() === centre.address.toLowerCase());
  const published = Boolean(mine && chain?.recipient === mine);
  const keep = (identity: string) => {
    saveCentreIdentity(cfg, centre.centreId, identity);
    live.refresh();
  };
  const generate = () => act.run(async () => keep((await generateCentreKey()).identity));
  const importKey = (text: string) =>
    act.run(async () => {
      const identity = (/AGE-SECRET-KEY-1[0-9A-Z]+/.exec(text.toUpperCase()) ?? [""])[0];
      await identityToRecipient(identity); // throws on an invalid key
      keep(identity);
    });
  const onFile = (e: ChangeEvent<HTMLInputElement>) => void e.target.files?.[0]?.text().then(importKey);
  // The name comes from the chain: a safe file name, and no line break in the header (the key is the only key line).
  const fileName = centre.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "centre";
  const download = () =>
    downloadText(`sealhour-${fileName}.agekey`, `# SealHour centre key: ${centre.name.replace(/[\r\n]+/g, " ")}\n# centre id: ${centre.centreId}\n# public key: ${mine}\n${centre.identity}\n`);
  const importFile = (
    <label className="btn btn-light mb-0">
      {t("live.importKey")}
      <input type="file" accept=".agekey,.txt,text/plain" onChange={onFile} className="visually-hidden" />
    </label>
  );

  return (
    <Step
      id="centre-key"
      title={t("live.keyTitle")}
      state={published ? "done" : "current"}
      summary={t("live.keyDone")}
    >
      {!chain ? null : !registered ? (
        <Notice tone="info" testId="not-registered">
          {t("live.notRegistered")} <Hex value={centre.address} head={10} tail={8} />
        </Notice>
      ) : !centre.identity ? (
        <>
          <p className="mb-3">{t("live.keyBody")}</p>
          <div className="d-flex flex-wrap align-items-center gap-2">
            <Button onClick={() => void generate()} busy={act.busy} testId="generate-key">
              <i className="ti ti-key me-1" aria-hidden="true" />
              {t("live.generateKey")}
            </Button>
            {importFile}
          </div>
          <VerifyDetails title={t("live.pasteKey")}>
            <Field label={t("live.pasteLabel")} htmlFor="paste-key">
              <textarea id="paste-key" rows={2} className="form-control font-monospace" value={paste} onChange={(e) => setPaste(e.target.value)} spellCheck={false} autoComplete="off" />
            </Field>
            <Button variant="secondary" onClick={() => void importKey(paste)} disabled={!paste.trim()}>
              {t("live.useKey")}
            </Button>
          </VerifyDetails>
        </>
      ) : (
        <>
          <p className="mb-2">
            {published ? t("live.keyDone") : chain?.frozen ? t("live.keyFrozenOther") : t("live.keyReady")} <Hex value={mine} head={12} tail={6} />
          </p>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
            <Button variant="secondary" onClick={download} testId="download-key">
              <i className="ti ti-download me-1" aria-hidden="true" />
              {t("live.downloadKey")}
            </Button>
            {chain?.frozen && !published ? importFile : null}
          </div>
          <Notice tone="warn">{t("live.keyWarning")}</Notice>
          {!chain?.frozen && mine ? (
            <TxStep
              label={t("live.publishKey")}
              testId="publish-key"
              disabled={published}
              disabledReason={t("live.keyDone")}
              run={async () => {
                if (!wallet) throw new Error(t("common.needWallet"));
                return sendTx(registry(cfg, wallet), "setCentreKey", [centre.centreId, recipientToBytes32(mine)]);
              }}
              onDone={() => setTick((n) => n + 1)}
            />
          ) : null}
        </>
      )}
      <ErrorBox error={act.error} cfg={cfg} />
    </Step>
  );
}

export function JoinStep({ centre, snap, b, onDone }: { centre: DemoCentre; snap: ExamSnapshot; b: BeaconState; onDone: () => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { live } = useApp();
  const { wallet } = useActor();
  const e = snap.exam;
  const same = (id: string) => id.toLowerCase() === centre.centreId.toLowerCase();
  const listed = snap.centres.some((c) => same(c.centreId));
  const joined = Boolean(snap.participations.find((p) => same(p.centreId))?.joined);
  const tooLate = b.round >= e.openRound;
  const reason = !e.created ? t("comite.examNotCreated") : !listed ? t("live.notListed") : !centre.identity ? t("live.needKey") : tooLate ? t("live.joinTooLate") : undefined;

  const join = async () => {
    if (!wallet) throw new Error(t("common.needWallet"));
    // r_c is kept on this device before the transaction: it prints the paper's fingerprint at the opening.
    const rc = centreRc(cfg, snap.examId, centre.centreId) || newRc();
    saveCentreRc(cfg, snap.examId, centre.centreId, rc);
    const tlocked = toUtf8Bytes(await tlockRc(rc, e.revealRound, b.client));
    if (tlocked.length > MAX_TLOCKED_RC) throw new Error(`tlocked r_c is ${tlocked.length} B, above ${MAX_TLOCKED_RC}`);
    const tx = await sendTx(registry(cfg, wallet), "joinExam", [snap.examId, centre.centreId, commitRc(rc), tlocked]);
    live.refresh();
    return tx;
  };

  return (
    <Step id="join" title={t("live.joinTitle")} state={joined ? "done" : e.created && listed ? "current" : "future"} summary={t("live.joined")}>
      <p className="mb-3">{t("live.joinBody")}</p>
      {joined ? (
        <p className="mb-0">
          <i className="ti ti-circle-check-filled text-success me-1" aria-hidden="true" />
          {t("live.joined")}
        </p>
      ) : (
        <TxStep label={t("live.join")} testId="join" run={join} onDone={onDone} disabled={reason !== undefined} disabledReason={reason} />
      )}
    </Step>
  );
}
