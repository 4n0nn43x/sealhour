// Merkle tree with sorted pair keccak256 hashing, compatible with OpenZeppelin MerkleProof.verify.
// Tree shape: leaves in the given order, adjacent pairs hashed, an odd last node is promoted unchanged.
import { concat, keccak256, solidityPacked } from "ethers";
import { toBytes32 } from "./util.js";

function hashPair(a: string, b: string): string {
  return a <= b ? keccak256(concat([a, b])) : keccak256(concat([b, a]));
}

function layers(leaves: string[]): string[][] {
  if (leaves.length === 0) throw new Error("merkle: no leaves");
  const out: string[][] = [leaves.map(toBytes32)];
  while (out[out.length - 1]!.length > 1) {
    const prev = out[out.length - 1]!;
    const next: string[] = [];
    for (let i = 0; i < prev.length; i += 2) next.push(i + 1 < prev.length ? hashPair(prev[i]!, prev[i + 1]!) : prev[i]!);
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: string[]): string {
  const l = layers(leaves);
  return l[l.length - 1]![0]!;
}

export function merkleProof(leaves: string[], index: number): string[] {
  if (!Number.isInteger(index) || index < 0 || index >= leaves.length) throw new RangeError(`merkle: index ${index} out of range`);
  const proof: string[] = [];
  let i = index;
  for (const layer of layers(leaves).slice(0, -1)) {
    const sibling = i ^ 1;
    if (sibling < layer.length) proof.push(layer[sibling]!);
    i >>= 1;
  }
  return proof;
}

export function verifyProof(leaf: string, proof: string[], root: string): boolean {
  try {
    let h = toBytes32(leaf);
    for (const p of proof) h = hashPair(h, toBytes32(p));
    return h === toBytes32(root);
  } catch {
    return false;
  }
}

/** keccak256(abi.encodePacked(bytes32[] centreIds)), identical to SealRegistry.freezeCentres. */
export function listRoot(centreIds: string[]): string {
  return keccak256(solidityPacked(["bytes32[]"], [centreIds.map(toBytes32)]));
}

/** Package leaf: keccak256(abi.encodePacked(bytes32 centreId, bytes32 sha256(ciphertext utf8))). */
export function packageLeaf(centreId: string, ciphertextSha256: string): string {
  return keccak256(solidityPacked(["bytes32", "bytes32"], [toBytes32(centreId), toBytes32(ciphertextSha256)]));
}
