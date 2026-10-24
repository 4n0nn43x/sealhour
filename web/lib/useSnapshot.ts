"use client";
// Load (and reload on demand) the on chain snapshot of an exam.
import { useCallback, useEffect, useState } from "react";
import type { AppConfig } from "./config";
import { readSnapshot, type ExamSnapshot } from "./registry";

export interface SnapshotState {
  snap: ExamSnapshot | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
}

export function useSnapshot(cfg: AppConfig, examId: string): SnapshotState {
  const [snap, setSnap] = useState<ExamSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    readSnapshot(cfg, examId)
      .then((s) => {
        if (!alive) return;
        setSnap(s);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (alive) setError(e ?? new Error("read failed"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [cfg, examId, tick]);
  return { snap, loading, error, reload };
}
