// Crockford base32 for typing a 48 byte beacon signature (SMS, phone call, paper).
// Layout: data characters in groups of 4, each group followed by one check character equal to
// (group value as a base 32 number) mod 37, written with the Crockford check alphabet
// (0-9A-Z without I L O U, then * ~ $ = U). Groups are separated by spaces.
// A single substituted character always changes a group checksum: 37 is prime and 32^k is never
// 0 mod 37, so any change of one data digit (difference 1..31) or of the check symbol is detected.
import { bytesToHex, hexToBytes } from "./util.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK_ALPHABET = ALPHABET + "*~$=U";
const GROUP = 4;

function normalizeChar(c: string): string {
  const u = c.toUpperCase();
  if (u === "I" || u === "L") return "1";
  if (u === "O") return "0";
  return u;
}

function groupCheck(digits: number[]): number {
  let v = 0;
  for (const d of digits) v = (v * 32 + d) % 37;
  return v;
}

/** Encode a signature (hex) as grouped Crockford base32 with check characters. */
export function encodeSignature(sigHex: string): string {
  const bytes = hexToBytes(sigHex);
  if (bytes.length === 0) throw new Error("empty signature");
  const digits: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      digits.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) digits.push((acc << (5 - bits)) & 31);
  const groups: string[] = [];
  for (let i = 0; i < digits.length; i += GROUP) {
    const g = digits.slice(i, i + GROUP);
    groups.push(g.map((d) => ALPHABET[d]).join("") + CHECK_ALPHABET[groupCheck(g)]);
  }
  return groups.join(" ");
}

/**
 * Decode text produced by encodeSignature back to lowercase hex (no 0x). Tolerates case, spaces,
 * dashes, I/L read as 1 and O as 0. Throws on any check mismatch (a typo) or malformed input.
 */
export function decodeSignature(text: string): string {
  const chars = [...text.replace(/[\s\-]+/g, "")].map(normalizeChar);
  if (chars.length === 0) throw new Error("empty input");
  const digits: number[] = [];
  for (let i = 0; i < chars.length; i += GROUP + 1) {
    const chunk = chars.slice(i, i + GROUP + 1);
    if (chunk.length < 2) throw new Error("truncated input: missing data or check character");
    const data = chunk.slice(0, -1).map((c, k) => {
      const d = ALPHABET.indexOf(c);
      if (d < 0) throw new Error(`invalid character "${c}" in group ${i / (GROUP + 1) + 1} position ${k + 1}`);
      return d;
    });
    const check = CHECK_ALPHABET.indexOf(chunk[chunk.length - 1]!);
    if (check < 0) throw new Error(`invalid check character "${chunk[chunk.length - 1]}" in group ${i / (GROUP + 1) + 1}`);
    if (groupCheck(data) !== check) throw new Error(`typo detected in group ${i / (GROUP + 1) + 1}`);
    digits.push(...data);
  }
  const nBytes = Math.floor((digits.length * 5) / 8);
  if (nBytes === 0) throw new Error("input too short");
  const out = new Uint8Array(nBytes);
  let acc = 0;
  let bits = 0;
  let o = 0;
  for (const d of digits) {
    acc = ((acc << 5) | d) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (o < nBytes) out[o++] = (acc >> bits) & 0xff;
    }
  }
  if (bits >= 5 || (acc & ((1 << bits) - 1)) !== 0) throw new Error("invalid length or padding: a character is missing or extra");
  return bytesToHex(out);
}
