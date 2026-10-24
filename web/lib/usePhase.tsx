"use client";
// Exam phase for the demo exam, computed from the chain snapshot and the beacon clock (no new chain logic).
// One PhaseProvider per page (mounted by Shell's Page when the config is loaded) owns the beacon clock and the
// snapshot, so the topbar stepper and the page share them: usePhase().b, .snap, .reload.
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useConfig } from "@/components/Providers";
import { roundTimeMs, useBeacon, type BeaconState } from "./beacon";
import type { DictKey } from "./dict";
import { burnedIndexes, type ExamInfo, type ExamSnapshot } from "./registry";
import { useSnapshot } from "./useSnapshot";

/** setup: list not frozen or exam not created; sealing: before the opening; open: before the reveal; revealed; reserve. */
export type Phase = "setup" | "sealing" | "open" | "revealed" | "reserve";

export interface Milestone {
  key: "open" | "reveal" | "reserveOpen" | "reserveReveal";
  label: DictKey;
  round: number;
  atMs: number;
  reached: boolean;
}

export interface PhaseState {
  phase: Phase;
  b: BeaconState;
  snap: ExamSnapshot | null;
  loading: boolean;
  error: unknown;
  /** No usable snapshot: still loading, or the chain is unreachable (error, possibly with a stale snap). */
  unknown: boolean;
  /** Re-read the chain snapshot (the stepper's Refresh). */
  reload: () => void;
  /** The four exam rounds with their times, empty until the exam is created. */
  milestones: Milestone[];
  /** Next milestone not reached yet, and the time left to it (ms). */
  next: Milestone | null;
  leftMs: number;
  /** Packages sealed on chain (regular sets and the reserve) / packages expected; burned set indexes. */
  sealed: number;
  packages: number;
  burned: number[];
}

export function examMilestones(cfg: Parameters<typeof roundTimeMs>[0], b: BeaconState, e: ExamInfo): Milestone[] {
  const at = (r: number) => roundTimeMs(cfg, b.info, r);
  const m = (key: Milestone["key"], label: DictKey, round: number): Milestone => ({ key, label, round, atMs: at(round), reached: b.round >= round });
  return [
    m("open", "phase.opening", e.openRound),
    m("reveal", "phase.reveal", e.revealRound),
    m("reserveOpen", "phase.reserveOpen", e.reserveOpenRound),
    m("reserveReveal", "phase.reserveReveal", e.reserveRevealRound),
  ];
}

export function phaseOf(snap: ExamSnapshot | null, round: number): Phase {
  const e = snap?.exam;
  if (!e || !e.frozen || !e.created) return "setup";
  if (round < e.openRound) return "sealing";
  if (round < e.revealRound) return "open";
  if (round < e.reserveOpenRound) return "revealed";
  return "reserve";
}

const Ctx = createContext<PhaseState | null>(null);

export function PhaseProvider({ children }: { children: ReactNode }) {
  const cfg = useConfig();
  const b = useBeacon(cfg);
  const { snap, loading, error, reload } = useSnapshot(cfg, cfg.demo.examId);
  // Keep burned sets, sealed counts and steps current while the page stays open.
  useEffect(() => {
    const id = setInterval(reload, 15000);
    return () => clearInterval(id);
  }, [reload]);
  const created = Boolean(snap?.exam.created);
  const milestones = useMemo(() => (snap && created ? examMilestones(cfg, b, snap.exam) : []), [cfg, b, snap, created]);
  const next = milestones.find((x) => !x.reached) ?? null;
  const value: PhaseState = {
    phase: phaseOf(snap, b.round),
    b,
    snap,
    loading,
    error,
    unknown: !snap || error !== undefined,
    reload,
    milestones,
    next,
    leftMs: next ? next.atMs - b.nowMs : 0,
    sealed: snap ? snap.packages.filter((p) => p.submitted).length : 0,
    packages: snap?.packages.length ?? 0,
    burned: snap ? burnedIndexes(snap) : [],
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The exam phase. Only below <PhaseProvider> (every Page with a loaded config). */
export function usePhase(): PhaseState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePhase outside PhaseProvider");
  return v;
}

/** Same as usePhase, or null outside a PhaseProvider (shell parts that also render without a config). */
export function useOptionalPhase(): PhaseState | null {
  return useContext(Ctx);
}
