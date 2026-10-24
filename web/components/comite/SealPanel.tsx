"use client";
// Seal the set in this browser for every frozen centre, show the root, download the files, publish the root.
import { sealPackage, serializeExamSet, tlockText, type ExamSet } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import { registry, revertName, sendTx, type TxResult } from "@/lib/chain";
import { formatTime, useI18n } from "@/lib/i18n";
import { downloadText, packageUri, type PackageIndex } from "@/lib/packages";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Hex, Notice, Section, TxOutcome } from "../ui";

interface Sealed {
  index: PackageIndex;
  files: Record<string, string>;
  uri: string;
}

type Publish = { kind: "tx"; tx: TxResult } | { kind: "already"; chainRoot: string };

export function SealPanel({
  snap,
  setIndex,
  label,
  set,
  canSeal,
  refusal,
  b,
  onDone,
}: {
  snap: ExamSnapshot;
  setIndex: number;
  label: string;
  set: ExamSet | null;
  canSeal: boolean;
  refusal?: string;
  b: BeaconState;
  onDone: () => void;
}) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { wallet } = useActor();
  const seal = useAction<Sealed>();
  const pub = useAction<Publish>();
  const isReserve = setIndex === snap.exam.setCount;
  const openRound = isReserve ? snap.exam.reserveOpenRound : snap.exam.openRound;
  const revealRound = isReserve ? snap.exam.reserveRevealRound : snap.exam.revealRound;
  const onChain = snap.packages.find((p) => p.setIndex === setIndex);
  const tooLate = b.round >= openRound;

  const doSeal = () =>
    seal.run(async () => {
      if (!set) throw new Error(t("comite.noSet"));
      const centres = snap.centres.map((c) => ({ centreId: c.centreId, recipient: c.recipient! }));
      const res = await sealPackage({ set, centres, round: openRound, client: b.client });
      const publicCopy = await tlockText(serializeExamSet(set), revealRound, b.client);
      const files: Record<string, string> = { "public.tlock": publicCopy };
      const items = res.items.map((it) => {
        const file = `${it.centreId}.tlock`;
        files[file] = it.ciphertext;
        return { centreId: it.centreId, file, leaf: it.leaf };
      });
      const index: PackageIndex = { setIndex, label, round: openRound, root: res.root, items, publicCopy: "public.tlock" };
      files["index.json"] = JSON.stringify(index, null, 2) + "\n";
      return { index, files, uri: packageUri(snap.examId, setIndex) };
    });

  const publish = () =>
    pub.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      if (!seal.result) throw new Error(t("comite.sealFirst"));
      try {
        const tx = await sendTx(registry(cfg, wallet), "submitPackage", [snap.examId, setIndex, seal.result.index.root, seal.result.uri]);
        onDone();
        return { kind: "tx", tx };
      } catch (e) {
        if (revertName(e, cfg) === "AlreadyDone") return { kind: "already", chainRoot: onChain?.root ?? "" };
        throw e;
      }
    });

  const bundle = () => {
    if (!seal.result) return;
    downloadText(`sealhour-set-${setIndex}-bundle.json`, JSON.stringify({ uri: seal.result.uri, files: seal.result.files }, null, 2), "application/json");
  };

  return (
    <Section title={t("comite.sealTitle")} id="seal">
      <p>
        {t("comite.sealBody", {
          round: openRound,
          at: formatTime(roundTimeMs(cfg, b.info, openRound), locale),
          reveal: revealRound,
        })}
      </p>
      {onChain?.submitted ? (
        <Notice tone="info">
          {t("comite.alreadyOnChain")} <Hex value={onChain.root} head={10} tail={8} />
        </Notice>
      ) : null}
      {tooLate ? <Notice tone="warn">{t("comite.tooLateToSeal")}</Notice> : null}
      <Button onClick={() => void doSeal()} busy={seal.busy} disabled={!canSeal || !set} title={refusal} testId="seal">
        {t("comite.seal", { n: snap.centres.length })}
      </Button>
      {!canSeal && refusal ? <p className="hint">{refusal}</p> : null}
      {seal.busy ? <p className="muted">{t("comite.sealing")}</p> : null}
      <ErrorBox error={seal.error} cfg={cfg} />
      {seal.result ? (
        <div className="stack" data-testid="sealed">
          <Notice tone="ok">
            {t("comite.sealedRoot")} <Hex value={seal.result.index.root} head={10} tail={8} />
          </Notice>
          <ul className="files">
            {Object.entries(seal.result.files).map(([name, content]) => (
              <li key={name}>
                <button type="button" className="link" onClick={() => downloadText(name, content, name.endsWith(".json") ? "application/json" : "text/plain")}>
                  {name}
                </button>{" "}
                <span className="muted">{t("common.bytes", { n: content.length })}</span>
              </li>
            ))}
          </ul>
          <div className="row">
            <Button variant="secondary" onClick={bundle}>
              {t("comite.downloadBundle")}
            </Button>
            <Button onClick={() => void publish()} busy={pub.busy} disabled={tooLate} testId="submit-package">
              {t("comite.publish")}
            </Button>
          </div>
          <p className="hint">{t("comite.publishHint", { uri: seal.result.uri })}</p>
        </div>
      ) : null}
      <ErrorBox error={pub.error} cfg={cfg} />
      {pub.result?.kind === "tx" ? <TxOutcome tx={pub.result.tx} /> : null}
      {pub.result?.kind === "already" ? (
        <Notice tone="info" testId="already-done">
          {t("comite.alreadyDone")} <Hex value={pub.result.chainRoot} head={10} tail={8} />
        </Notice>
      ) : null}
    </Section>
  );
}
