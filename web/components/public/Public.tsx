"use client";
// Public page, driven by the exam phase. Before the reveal: countdown, key statement, juror's try (Proof).
// After it: the reveal (runs by itself), the leak verifier, the verdict with "Flag this centre". Registry folded.
import { useState } from "react";
import type { LeakVerdict } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { EmptyState, ExamTimeline } from "../blocks";
import { useI18n } from "@/lib/i18n";
import { usePhase } from "@/lib/usePhase";
import { ErrorBox, Loading } from "../ui";
import { FlagPanel } from "./FlagPanel";
import { Proof } from "./Proof";
import { Registry } from "./Registry";
import { RevealPanel, type RevealData } from "./RevealPanel";
import { Verifier } from "./Verifier";

export function Public() {
  const cfg = useConfig();
  const { t } = useI18n();
  const { snap, b, phase, loading, error } = usePhase();
  const [data, setData] = useState<RevealData | null>(null);
  const [leak, setLeak] = useState<{ text: string; verdict: LeakVerdict | null } | null>(null);

  if (!snap) return loading ? <Loading /> : <ErrorBox error={error} cfg={cfg} />;
  const after = phase === "revealed" || phase === "reserve";
  return (
    <div className="row">
      <div className="col-xl-8">
        {!snap.exam.created ? (
          <div className="card">
            <EmptyState icon="hourglass-bold-duotone" title={t("comite.examNotCreated")} body={t("frozen.emptyBody")} />
          </div>
        ) : after ? (
          <>
            <RevealPanel snap={snap} b={b} data={data} onData={setData} />
            <Verifier snap={snap} b={b} data={data} onLeak={(text, verdict) => setLeak({ text, verdict })} />
            <FlagPanel snap={snap} revealed={Boolean(data)} leak={leak} />
          </>
        ) : (
          <Proof snap={snap} />
        )}
        <Registry snap={snap} />
      </div>
      <div className="col-xl-4">
        <ExamTimeline />
      </div>
    </div>
  );
}
