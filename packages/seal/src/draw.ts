// Public, verifiable draw of the exam set and of the record copies from the opening round signature.
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, concatBytes, hexToBytes, uint32BE, utf8 } from "./util.js";

/**
 * Index of the drawn set: eligible indexes sorted ascending, pick BigInt(sha256(signature)) mod n.
 * Eligible = unburned, and, when `submitted` is given, also in `submitted` (sets whose package root
 * is non zero on chain), so a set without a package is never drawn. Without `submitted` the result
 * is the same as before (unburned only). Throws if no set is eligible.
 */
export function drawSet(signatureHex: string, setCount: number, burned: number[], submitted?: number[]): number {
  if (!Number.isInteger(setCount) || setCount < 1) throw new RangeError("setCount must be a positive integer");
  const burnedSet = new Set(burned);
  const submittedSet = submitted ? new Set(submitted) : null;
  const unburned: number[] = [];
  for (let i = 0; i < setCount; i++) if (!burnedSet.has(i) && (!submittedSet || submittedSet.has(i))) unburned.push(i);
  if (unburned.length === 0) {
    throw new Error(submittedSet ? "no set is both unburned and submitted: nothing can be drawn" : "every set is burned: nothing can be drawn");
  }
  const h = BigInt("0x" + bytesToHex(sha256(hexToBytes(signatureHex))));
  return unburned[Number(h % BigInt(unburned.length))]!;
}

/**
 * Positions (1 based, ascending, distinct) in the printed stack of the copies that go to the record
 * (proces-verbal). Derived from sha256("sealhour/record-copies" || signature || counter), rejection
 * sampled so the choice is uniform. If pick >= copies every copy is returned.
 */
export function recordCopyIndexes(signatureHex: string, copies: number, pick = 3): number[] {
  if (!Number.isInteger(copies) || copies < 1) throw new RangeError("copies must be a positive integer");
  if (!Number.isInteger(pick) || pick < 0) throw new RangeError("pick must be a non negative integer");
  if (pick >= copies) return Array.from({ length: copies }, (_, i) => i + 1);
  const seed = concatBytes(utf8("sealhour/record-copies"), hexToBytes(signatureHex));
  const chosen = new Set<number>();
  const limit = Math.floor(0x100000000 / copies) * copies;
  for (let counter = 0; chosen.size < pick; counter++) {
    const block = sha256(concatBytes(seed, uint32BE(counter)));
    for (let o = 0; o + 4 <= block.length && chosen.size < pick; o += 4) {
      const v = new DataView(block.buffer, block.byteOffset + o, 4).getUint32(0);
      if (v >= limit) continue;
      chosen.add((v % copies) + 1);
    }
  }
  return [...chosen].sort((a, b) => a - b);
}
