// drand compatible beacons: a local simulator (same scheme as quicknet), an HTTP relay client,
// the real quicknet client, and an offline client fed with a single verified signature.
import { mainnetClient, HttpChainClient, HttpCachingChain } from "tlock-js";
import type { ChainClient, ChainInfo } from "tlock-js";
import { bls12_381 as bls } from "@noble/curves/bls12-381";
import { sha256 } from "@noble/hashes/sha256";
import { BadSignatureError, TooEarlyError } from "./errors.js";
import { bytesToHex, cleanHex, hexToBytes, uint64BE, utf8 } from "./util.js";

export type { ChainClient, ChainInfo };
export type BeaconInfo = ChainInfo;

/** A drand beacon as served by /public/{round}. */
export interface Beacon {
  round: number;
  randomness: string;
  signature: string;
}

export interface LocalBeacon {
  info: BeaconInfo;
  secretKeyHex: string;
  /** Hex encoded 48 byte compressed G1 signature of the round. */
  sign(round: number): string;
  currentRound(nowMs?: number): number;
  /** A client that refuses any round after the current one: no key from the future. */
  client(): ChainClient;
}

export const SCHEME_ID = "bls-unchained-g1-rfc9380";
export const DST = "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";
const LOCAL_BEACON_ID = "sealhour-local";

/** Message point for a round: H_G1(sha256(round as uint64 big endian)). */
type G1Point = ReturnType<typeof bls.G1.ProjectivePoint.fromHex>;
function roundMessagePoint(round: number): G1Point {
  return bls.G1.hashToCurve(sha256(uint64BE(round)), { DST }) as unknown as G1Point;
}

/** Round in progress at timeMs. 0 before genesis (same convention as SealRegistry.currentRound). */
export function roundAt(info: BeaconInfo, timeMs: number): number {
  if (!Number.isFinite(timeMs)) throw new TypeError("timeMs must be finite");
  const g = info.genesis_time * 1000;
  if (timeMs < g) return 0;
  return Math.floor((timeMs - g) / (info.period * 1000)) + 1;
}

/** Time (ms since epoch) at which a round is emitted. */
export function roundTime(info: BeaconInfo, round: number): number {
  if (!Number.isFinite(round)) throw new TypeError("round must be finite");
  const r = round < 0 ? 0 : round;
  return (info.genesis_time + (r - 1) * info.period) * 1000;
}

/**
 * Check a beacon signature for a round against the chain public key.
 * Only the bls-unchained-g1-rfc9380 scheme (quicknet and the local beacon) is supported.
 */
export function verifyBeaconSignature(info: BeaconInfo, round: number, signatureHex: string): boolean {
  try {
    if (info.schemeID !== SCHEME_ID) return false;
    if (!Number.isInteger(round) || round < 1) return false;
    const sig = hexToBytes(signatureHex);
    if (sig.length !== 48) return false;
    return bls.verifyShortSignature(sig, roundMessagePoint(round), cleanHex(info.public_key));
  } catch {
    return false;
  }
}

/** Deterministic chain hash for a local beacon: sha256 over its defining fields. */
function localChainHash(publicKeyHex: string, period: number, genesis: number): string {
  return bytesToHex(sha256(utf8(`${LOCAL_BEACON_ID}|${SCHEME_ID}|${publicKeyHex}|${period}|${genesis}`)));
}

function beaconFromSignature(round: number, signatureHex: string): Beacon {
  const sig = cleanHex(signatureHex);
  return { round, randomness: bytesToHex(sha256(hexToBytes(sig))), signature: sig };
}

/**
 * Local beacon with a freshly generated (or given) BLS key, same scheme and API shape as drand quicknet.
 * Defaults: genesis now, period 3 seconds.
 */
export function createLocalBeacon(opts: { genesisTime?: number; period?: number; secretKeyHex?: string } = {}): LocalBeacon {
  const period = opts.period ?? 3;
  const genesis = opts.genesisTime ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(period) || period < 1) throw new TypeError("period must be a positive integer");
  if (!Number.isInteger(genesis) || genesis < 0) throw new TypeError("genesisTime must be a non negative integer (seconds)");
  const sk = opts.secretKeyHex ? hexToBytes(opts.secretKeyHex) : bls.utils.randomPrivateKey();
  const secretKeyHex = bytesToHex(sk);
  const publicKeyHex = bytesToHex(bls.getPublicKeyForShortSignatures(sk));
  const hash = localChainHash(publicKeyHex, period, genesis);
  const info: BeaconInfo = {
    public_key: publicKeyHex,
    period,
    genesis_time: genesis,
    hash,
    groupHash: hash,
    schemeID: SCHEME_ID,
    metadata: { beaconID: LOCAL_BEACON_ID },
  };
  const sign = (round: number): string => {
    if (!Number.isInteger(round) || round < 1) throw new RangeError("round must be an integer >= 1");
    return bytesToHex(bls.signShortSignature(roundMessagePoint(round), sk).toRawBytes(true));
  };
  const currentRound = (nowMs: number = Date.now()) => roundAt(info, nowMs);
  const client = (): ChainClient => {
    const c = {
      options: { disableBeaconVerification: false, noCache: true },
      chain() {
        return { baseUrl: `local:${hash}`, info: async () => info };
      },
      async get(round: number): Promise<Beacon> {
        const cur = currentRound();
        if (round > cur) throw new TooEarlyError(`round ${round} not emitted yet (current ${cur})`, round);
        return beaconFromSignature(round, sign(round));
      },
      async latest(): Promise<Beacon> {
        const cur = currentRound();
        if (cur < 1) throw new TooEarlyError("beacon has not started yet", 1);
        return c.get(cur);
      },
    };
    return c as unknown as ChainClient;
  };
  return { info, secretKeyHex, sign, currentRound, client };
}

/** Expected chain of a relay: hash and public key as published out of band (contract, deployment.json). */
export interface BeaconPin {
  chainHash: string;
  publicKey: string;
}

/** drand quicknet pin (same constants as tlock-js mainnetClient). */
export const QUICKNET_PIN: BeaconPin = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  publicKey:
    "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a",
};

const normHex = (h: string) => String(h ?? "").trim().replace(/^0x/i, "").toLowerCase();

/** True when the chain info has exactly the pinned hash and public key (hex, case and 0x insensitive). */
export function infoMatchesPin(info: Pick<BeaconInfo, "hash" | "public_key">, pin: BeaconPin): boolean {
  return normHex(info.hash) === normHex(pin.chainHash) && normHex(info.public_key) === normHex(pin.publicKey);
}

/**
 * Client for any drand compatible HTTP relay (the local beacon-server or a public drand relay).
 * With a pin (every production caller passes one), the relay /info is rejected unless its hash and
 * public key equal the pin: a relay serving its own key cannot sign rounds for this chain.
 */
export function httpBeaconClient(baseUrl: string, pinned?: BeaconPin): ChainClient {
  const url = baseUrl.replace(/\/+$/, "");
  const options = {
    disableBeaconVerification: false,
    noCache: false,
    ...(pinned ? { chainVerificationParams: { chainHash: normHex(pinned.chainHash), publicKey: normHex(pinned.publicKey) } } : {}),
  };
  const chain = new HttpCachingChain(url, options);
  if (pinned) {
    const fetchInfo = chain.info.bind(chain);
    chain.info = async () => {
      const info = await fetchInfo();
      if (!infoMatchesPin(info, pinned)) throw new Error(`beacon relay ${url} serves chain ${info.hash} with a public key that differs from the pin`);
      return info;
    };
  }
  return new HttpChainClient(chain, options);
}

/** drand quicknet (League of Entropy mainnet, bls-unchained-g1-rfc9380, 3 s period), pinned to QUICKNET_PIN. */
export function quicknetClient(): ChainClient {
  return mainnetClient();
}

/**
 * Offline client: verifies one signature (received by SMS, QR, base32 typing) against the chain
 * public key, then serves it. Throws BadSignatureError if the signature is not valid for that round.
 * The channel the signature came through does not need to be trusted.
 */
export function offlineClient(info: BeaconInfo, round: number, signatureHex: string): ChainClient {
  if (!verifyBeaconSignature(info, round, signatureHex)) {
    throw new BadSignatureError(`signature does not verify for round ${round} of chain ${info.hash}`);
  }
  const beacon = beaconFromSignature(round, signatureHex);
  const c = {
    options: { disableBeaconVerification: false, noCache: true },
    chain() {
      return { baseUrl: `offline:${info.hash}`, info: async () => info };
    },
    async get(r: number): Promise<Beacon> {
      if (r !== round) throw new Error(`offline client only holds round ${round}, asked for ${r}`);
      return { ...beacon };
    },
    async latest(): Promise<Beacon> {
      return { ...beacon };
    },
  };
  return c as unknown as ChainClient;
}
