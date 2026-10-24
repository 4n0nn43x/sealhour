"use client";
// Run an async action with busy and error state; never lets a rejection escape.
import { useCallback, useRef, useState } from "react";

export interface Action<T> {
  busy: boolean;
  error: unknown;
  result: T | undefined;
  run: (fn: () => Promise<T>) => Promise<T | undefined>;
  reset: () => void;
}

export function useAction<T = unknown>(): Action<T> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(undefined);
  const [result, setResult] = useState<T | undefined>(undefined);
  const seq = useRef(0);
  const run = useCallback(async (fn: () => Promise<T>) => {
    const id = ++seq.current;
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const r = await fn();
      if (id === seq.current) setResult(r);
      return r;
    } catch (e) {
      if (id === seq.current) setError(e ?? new Error("unknown error"));
      return undefined;
    } finally {
      if (id === seq.current) setBusy(false);
    }
  }, []);
  const reset = useCallback(() => {
    seq.current++;
    setBusy(false);
    setError(undefined);
    setResult(undefined);
  }, []);
  return { busy, error, result, run, reset };
}
