"use client";
// Beacon access: chain info (cached for offline opening), a 1 s clock, relay polling every period.
// Demo: the local relay. Live: drand quicknet relays tried in order (api, api2, api3.drand.sh, drand.cloudflare.com).
import { useEffect, useMemo, useState } from "react";
import { httpBeaconClient, infoMatchesPin, roundAt, roundTime, TooEarlyError, type BeaconInfo, type BeaconPin, type ChainClient } from "@sealhour/seal";
import type { AppConfig } from "./config";
import { storage } from "./storage";

const infoKey = (cfg: AppConfig) => (cfg.mode === "live" ? "sealhour.testnet.beaconInfo" : "sealhour.beaconInfo");
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
  const raw = storage.get(infoKey(cfg));
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

/** Cloudflare answers 404 (not 425) for a future round and caches that 404 for months: never ask it for a round
 *  before the round's time. The other relays answer 425. */
const cachesFuture404 = (url: string) => /cloudflare/i.test(url);

/** First relay answering path (fetch error or HTTP error: next relay). Live adds a cache buster. */
async function relayGet(cfg: AppConfig, path: string): Promise<Response> {
  let last: unknown = new Error("no beacon relay configured");
  for (const u of cfg.beaconUrls) {
    try {
      const res = await fetch(`${u}${path}${cfg.mode === "live" ? `?${Date.now()}` : ""}`, { cache: "no-store" });
      if (res.ok) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** Live client over several drand relays, pinned: chain info must match the pin; 425 means "too early"
 *  (TooEarlyError), and so does 404 while the round is in the future by the clock; after the round's time a 404, an
 *  HTTP error or a network failure moves to the next relay. No custom header (no CORS preflight), no cache.
 *  Signatures are verified by the seal module (verifyingClient, offlineClient), never trusted from the relay. */
export function relayClient(urls: string[], pin: BeaconPin): ChainClient {
  let infoP: Promise<BeaconInfo> | null = null;
  const info = () =>
    (infoP ??= (async () => {
      let last: unknown;
      for (const u of urls) {
        try {
          const res = await fetch(`${u}/info?${Date.now()}`, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const i = (await res.json()) as BeaconInfo;
          if (!infoMatchesPin(i, pin)) throw new Error(PIN_MISMATCH);
          return i;
        } catch (e) {
          last = e;
        }
      }
      throw last;
    })().catch((e: unknown) => {
      infoP = null;
      throw e;
    }));
  const fetchRound = async (round: number | "latest") => {
    const future = round !== "latest" && Date.now() < roundTime(await info(), round);
    let last: unknown;
    let early = false;
    for (const u of urls) {
      if (future && cachesFuture404(u)) continue;
      try {
        const res = await fetch(`${u}/public/${round}?${Date.now()}`, { cache: "no-store" });
        if (res.status === 425 || (res.status === 404 && future)) {
          early = true;
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as unknown;
      } catch (e) {
        last = e;
      }
    }
    if (early || future) throw new TooEarlyError(`too early: round ${round} is not served yet (425)`, round === "latest" ? undefined : round);
    throw last;
  };
  const c = {
    options: { disableBeaconVerification: false, noCache: true },
    chain: () => ({ baseUrl: urls[0], info }),
    get: (round: number) => fetchRound(round),
    latest: () => fetchRound("latest"),
  };
  return c as unknown as ChainClient;
}

export function useBeacon(cfg: AppConfig): BeaconState {
  const client = useMemo(() => (cfg.mode === "live" ? relayClient(cfg.beaconUrls, beaconPin(cfg)) : httpBeaconClient(cfg.beaconUrl, beaconPin(cfg))), [cfg]);
  const [info, setInfo] = useState<BeaconInfo | null>(null);
  const [infoSource, setInfoSource] = useState<"relay" | "cache" | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [nowMs, setNow] = useState(() => Date.now());
  const [relayRound, setRelayRound] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const i = (await (await relayGet(cfg, "/info")).json()) as BeaconInfo;
        if (!alive) return;
        // Never use or cache a chain info whose hash or public key differs from the pin.
        if (!infoMatchesPin(i, beaconPin(cfg))) throw new Error(PIN_MISMATCH);
        storage.set(infoKey(cfg), JSON.stringify(i));
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
        const b = (await (await relayGet(cfg, "/public/latest")).json()) as { round?: number };
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
  }, [cfg, period]);

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

/** HTTP status the relay returns for a round (425 Too Early for a future round), null if unreachable.
 *  Relays in order until one answers definitively (200 or 425); live: a 404 while the round is in the future by the
 *  clock is a "too early" (reported as 425), after that it is not definitive. Otherwise the last status seen. */
export async function relayStatus(cfg: AppConfig, round: number): Promise<number | null> {
  const future = Date.now() < roundTimeMs(cfg, null, round);
  let last: number | null = null;
  for (const u of cfg.beaconUrls) {
    if (cfg.mode === "live" && future && cachesFuture404(u)) continue;
    try {
      const res = await fetch(`${u}/public/${round}${cfg.mode === "live" ? `?${Date.now()}` : ""}`, { cache: "no-store" });
      last = cfg.mode === "live" && res.status === 404 && future ? 425 : res.status;
      if (last === 200 || last === 425) return last;
    } catch {
      /* next relay */
    }
  }
  return last;
}

/** Fetch and return the signature of a round from the relay (the client verifies it against the chain key). */
export async function fetchRoundSignature(client: ChainClient, round: number): Promise<string> {
  const b = (await client.get(round)) as { signature: string };
  return b.signature;
}
