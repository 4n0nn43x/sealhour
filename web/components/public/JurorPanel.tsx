"use client";
// "Take it, there is no pliers": a juror downloads Cotonou's package and tries to open it without the centre key.
import { useState } from "react";
import { generateCentreKey, openForCentre } from "@sealhour/seal";
import { useConfig } from "../Providers";
import type { BeaconState } from "@/lib/beacon";
import { errorKind, explainError } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { downloadText, fetchCentreCiphertext, type FetchedCiphertext } from "@/lib/packages";
import { setLabel, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Notice, Section } from "../ui";

export function JurorPanel({ snap, b }: { snap: ExamSnapshot; b: BeaconState }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const target = cfg.demo.centres.find((c) => c.name === "Cotonou") ?? cfg.demo.centres[0];
  const [setIndex, setSetIndex] = useState(0);
  const dl = useAction<FetchedCiphertext>();
  const tryOpen = useAction<{ kind: string; message: string }>();
  const pkg = snap.packages.find((p) => p.setIndex === setIndex);

  const download = () =>
    dl.run(async () => {
      if (!target || !pkg?.submitted) throw new Error(t("centre.noPackage"));
      const f = await fetchCentreCiphertext(cfg, pkg.uri, target.centreId, pkg.root);
      downloadText(f.file, f.ciphertext);
      return f;
    });

  const attempt = () =>
    tryOpen.run(async () => {
      const f = dl.result ?? (await download());
      if (!f) throw new Error(t("centre.noPackage"));
      const stranger = await generateCentreKey();
      try {
        await openForCentre({ ciphertext: f.ciphertext, identity: stranger.identity, client: b.client });
        return { kind: "opened", message: t("juror.opened") };
      } catch (e) {
        const kind = errorKind(e);
        return { kind, message: kind === "WrongKeyError" ? t("juror.notACentre") : explainError(e, t, cfg) };
      }
    });

  if (!target) return null;
  return (
    <Section title={t("juror.title")} id="juror">
      <p>{t("juror.body", { name: target.name })}</p>
      <div className="row">
        <label>
          {t("public.set")}{" "}
          <select value={setIndex} onChange={(e) => (setSetIndex(Number(e.target.value)), dl.reset(), tryOpen.reset())}>
            {Array.from({ length: snap.exam.setCount }, (_, i) => (
              <option key={i} value={i}>
                {setLabel(cfg, i)}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={() => void download()} busy={dl.busy} testId="juror-download">
          {t("juror.download", { name: target.name })}
        </Button>
        <Button onClick={() => void attempt()} busy={tryOpen.busy} testId="juror-open">
          {t("juror.tryOpen")}
        </Button>
      </div>
      <ErrorBox error={dl.error} cfg={cfg} />
      {dl.result ? (
        <p className="muted">
          {t("juror.downloaded", { file: dl.result.file, n: dl.result.ciphertext.length })} <Chip ok={dl.result.leafOk && dl.result.rootOk}>{t("centre.rootOk")}</Chip>
        </p>
      ) : null}
      <ErrorBox error={tryOpen.error} cfg={cfg} />
      {tryOpen.result ? (
        <Notice tone={tryOpen.result.kind === "opened" ? "error" : "ok"} testId="juror-result">
          {tryOpen.result.kind !== "opened" ? <strong>{t("centre.refused")} </strong> : null}
          {tryOpen.result.message}
        </Notice>
      ) : null}
    </Section>
  );
}
