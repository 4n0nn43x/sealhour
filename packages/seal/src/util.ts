// Internal helpers shared by the modules. Browser safe: no Node-only APIs.
import { bytesToHex as nobleBytesToHex, hexToBytes as nobleHexToBytes } from "@noble/hashes/utils";

/** Strip an optional 0x prefix and lowercase. Throws on non hex input. */
export function cleanHex(hex: string): string {
  if (typeof hex !== "string") throw new TypeError("expected a hex string");
  let h = hex.trim();
  if (h.startsWith("0x") || h.startsWith("0X")) h = h.slice(2);
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new TypeError(`invalid hex string: ${hex}`);
  return h.toLowerCase();
}

export function hexToBytes(hex: string): Uint8Array {
  return nobleHexToBytes(cleanHex(hex));
}

export function bytesToHex(bytes: Uint8Array): string {
  return nobleBytesToHex(bytes);
}

/** 0x prefixed lowercase hex. */
export function to0x(bytes: Uint8Array): string {
  return "0x" + nobleBytesToHex(bytes);
}

/** Normalize a bytes32 value to 0x prefixed lowercase hex, throwing if it is not exactly 32 bytes. */
export function toBytes32(hex: string): string {
  const h = cleanHex(hex);
  if (h.length !== 64) throw new TypeError(`expected 32 bytes, got ${h.length / 2}: ${hex}`);
  return "0x" + h;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function uint64BE(n: number | bigint): Uint8Array {
  const m = new Uint8Array(8);
  new DataView(m.buffer).setBigUint64(0, BigInt(n));
  return m;
}

export function uint32BE(n: number): Uint8Array {
  const m = new Uint8Array(4);
  new DataView(m.buffer).setUint32(0, n >>> 0);
  return m;
}
