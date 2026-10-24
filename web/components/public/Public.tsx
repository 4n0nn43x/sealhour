"use client";
// Public screen: what anyone can check, before T (no key exists) and after the reveal (sets, r_c, verifier).
import { useState } from "react";
import type { LeakVerdict } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { useBeacon } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { useSnapshot } from "@/lib/useSnapshot";
import { BeaconBar, Countdown } from "../Beacon";
import { Button, ErrorBox, Loading, Notice } from "../ui";
import { FlagPanel } from "./FlagPanel";
import { JurorPanel } from "./JurorPanel";
import { NoKeyProof } from "./NoKeyProof";
import { Overview } from "./Overview";
import { RevealPanel, type RevealData } from "./RevealPanel";
import { Verifier } from "./Verifier";

export function Public() {
  const cfg = useConfig();
  const { t } = useI18n();
  const b = useBeacon(cfg);
  const { snap, loading, error, reload } = useSnapshot(cfg, cfg.demo.examId);
  const [data, setData] = useState<RevealData | null>(null);
  const [leak, setLeak] = useState<{ text: string; verdict: LeakVerdict } | null>(null);

  return (
    <>
      <div className="toolbar">
        <BeaconBar b={b} />
        <Button variant="secondary" onClick={reload}>
          {t("common.reload")}
        </Button>
      </div>
      {loading && !snap ? <Loading /> : null}
      <ErrorBox error={error} cfg={cfg} />
      {snap ? (
        <>
          {!snap.exam.created ? <Notice tone="warn">{t("comite.examNotCreated")}</Notice> : null}
          {snap.exam.created ? <Countdown b={b} round={snap.exam.openRound} label={t("public.countdown")} /> : null}
          <Overview snap={snap} b={b} />
          {snap.exam.created ? (
            <>
              <NoKeyProof round={snap.exam.openRound} b={b} />
              <JurorPanel snap={snap} b={b} />
              <RevealPanel snap={snap} b={b} data={data} onData={setData} />
              <Verifier snap={snap} b={b} data={data} onLeak={(text, verdict) => setLeak({ text, verdict })} />
              <FlagPanel snap={snap} b={b} evidence={leak?.text ?? ""} suggested={leak?.verdict.centreId} />
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}
