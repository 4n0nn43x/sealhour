"use client";
// Beacon access: chain info (cached for offline opening), a 1 s clock, relay polling every period.
import { useEffect, useMemo, useState } from "react";
import { httpBeaconClient, infoMatchesPin, roundAt, roundTime, type BeaconInfo, type BeaconPin, type ChainClient } from "@sealhour/seal";
import type { AppConfig } from "./config";
import { storage } from "./storage";

const INFO_KEY = "sealhour.beaconInfo";
/** infoError value when the relay serves a chain other than the pinned one (or no pin is configured). */
export const PIN_MISMATCH = "BeaconPinMismatch";

/** Beacon pin from the deployment (contract immutables, copied in deployment.json). Empty: nothing matches. */
export function beaconPin(cfg: AppConfig): BeaconPin {
  return { chainHash: cfg.deployment.beaconChainHash ?? "", publicKey: cfg.deployment.beaconPublicKey ?? "" };
}

export interface BeaconState {
  /** Chain info from the relay, or the cached copy when the relay is unreachable. */
  info: BeaconInfo | null;
  infoSource: "relay" | "cache" | null;
  infoError: string | null;
  /** Round clock, always available from the deployment (genesis, period). */
  genesis: number;
  period: number;
  nowMs: number;
  round: number;
  /** Latest round served by the relay at the last poll, null if unreachable. */
  relayRound: number | null;
  relayOnline: boolean;
  client: ChainClient;
}

export function clockInfo(cfg: AppConfig, info: BeaconInfo | null): BeaconInfo {
  if (info) return info;
  return {
    public_key: "",
    period: cfg.deployment.period,
    genesis_time: cfg.deployment.genesisTime,
    hash: "",
    groupHash: "",
    schemeID: "",
    metadata: { beaconID: "" },
  } as BeaconInfo;
}

export function roundTimeMs(cfg: AppConfig, info: BeaconInfo | null, round: number): number {
  return roundTime(clockInfo(cfg, info), round);
}

function readCachedInfo(cfg: AppConfig): BeaconInfo | null {
  const raw = storage.get(INFO_KEY);
  if (!raw) return null;
  try {
    const info = JSON.parse(raw) as BeaconInfo;
    if (info.genesis_time !== cfg.deployment.genesisTime || info.period !== cfg.deployment.period) return null;
    if (!infoMatchesPin(info, beaconPin(cfg))) return null;
    return info;
  } catch {
    return null;
  }
}

export function useBeacon(cfg: AppConfig): BeaconState {
  const client = useMemo(() => httpBeaconClient(cfg.beaconUrl, beaconPin(cfg)), [cfg]);
  const [info, setInfo] = useState<BeaconInfo | null>(null);
  const [infoSource, setInfoSource] = useState<"relay" | "cache" | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [nowMs, setNow] = useState(() => Date.now());
  const [relayRound, setRelayRound] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${cfg.beaconUrl}/info`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const i = (await res.json()) as BeaconInfo;
        if (!alive) return;
        // Never use or cache a chain info whose hash or public key differs from the pin.
        if (!infoMatchesPin(i, beaconPin(cfg))) throw new Error(PIN_MISMATCH);
        storage.set(INFO_KEY, JSON.stringify(i));
        setInfo(i);
        setInfoSource("relay");
        setInfoError(null);
      } catch (e) {
        if (!alive) return;
        const cached = readCachedInfo(cfg);
        setInfo(cached);
        setInfoSource(cached ? "cache" : null);
        setInfoError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [cfg]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const period = info?.period ?? cfg.deployment.period;
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`${cfg.beaconUrl}/public/latest`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const b = (await res.json()) as { round?: number };
        if (alive) setRelayRound(Number(b.round ?? 0));
      } catch {
        if (alive) setRelayRound(null);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), Math.max(1, period) * 1000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [cfg.beaconUrl, period]);

  const round = roundAt(clockInfo(cfg, info), nowMs);
  return {
    info,
    infoSource,
    infoError,
    genesis: info?.genesis_time ?? cfg.deployment.genesisTime,
    period,
    nowMs,
    round,
    relayRound,
    relayOnline: relayRound !== null,
    client,
  };
}

/** HTTP status the relay returns for a round (425 Too Early for a future round), null if unreachable. */
export async function relayStatus(cfg: AppConfig, round: number): Promise<number | null> {
  try {
    const res = await fetch(`${cfg.beaconUrl}/public/${round}`, { cache: "no-store" });
    return res.status;
  } catch {
    return null;
  }
}

/** Fetch and return the signature of a round from the relay (the client verifies it against the chain key). */
export async function fetchRoundSignature(client: ChainClient, round: number): Promise<string> {
  const b = (await client.get(round)) as { signature: string };
  return b.signature;
}
