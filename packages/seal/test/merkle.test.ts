import { describe, expect, it } from "vitest";
import { solidityPackedKeccak256, keccak256, concat } from "ethers";
import { listRoot, merkleProof, merkleRoot, packageLeaf, verifyProof } from "../src/index.js";
import { centreId } from "./fixtures.js";

describe("listRoot", () => {
  it("equals keccak256(abi.encodePacked(bytes32[])) as computed by ethers", () => {
    const ids = [1, 2, 3, 4].map(centreId);
    const expected = solidityPackedKeccak256(["bytes32[]"], [ids]);
    expect(listRoot(ids)).toBe(expected);
    // fixed vector, recomputed independently: keccak256 of the 128 byte concatenation
    expect(listRoot(ids)).toBe(keccak256(concat(ids)));
    // known vector: ethers solidityPackedKeccak256(["bytes32[]"], [[1, 2, 3, 4] as bytes32])
    expect(listRoot(ids)).toBe("0x392791df626408017a264f53fde61065d5a93a32b60171df9d8a46afdf82992d");
    expect(listRoot([ids[1]!, ids[0]!, ids[2]!, ids[3]!])).not.toBe(expected); // order matters, like the contract
  });
});

describe("merkle (sorted pairs, OpenZeppelin compatible)", () => {
  it("proves every leaf for sizes 1..9", () => {
    for (let n = 1; n <= 9; n++) {
      const leaves = Array.from({ length: n }, (_, i) => packageLeaf(centreId(i + 1), keccak256(new Uint8Array([i]))));
      const root = merkleRoot(leaves);
      if (n === 1) expect(root).toBe(leaves[0]);
      leaves.forEach((l, i) => expect(verifyProof(l, merkleProof(leaves, i), root)).toBe(true));
      expect(verifyProof(keccak256("0x01"), merkleProof(leaves, 0), root)).toBe(false);
    }
  });

  it("hashes pairs sorted (OpenZeppelin _hashPair)", () => {
    const a = keccak256("0xaa");
    const b = keccak256("0xbb");
    const [lo, hi] = a < b ? [a, b] : [b, a];
    expect(merkleRoot([a, b])).toBe(keccak256(concat([lo, hi])));
    expect(merkleRoot([b, a])).toBe(merkleRoot([a, b]));
  });

  it("packageLeaf = keccak256(abi.encodePacked(bytes32, bytes32))", () => {
    const h = keccak256("0x1234");
    expect(packageLeaf(centreId(7), h)).toBe(solidityPackedKeccak256(["bytes32", "bytes32"], [centreId(7), h]));
  });
});
