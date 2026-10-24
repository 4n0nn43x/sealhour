import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { drawSet, recordCopyIndexes } from "../src/index.js";
import { testBeacon } from "./fixtures.js";

describe("drawSet", () => {
  it("follows BigInt(sha256(sig)) mod n over unburned sets sorted ascending", () => {
    const b = testBeacon();
    const sig = b.sign(5);
    const h = BigInt("0x" + bytesToHex(sha256(Buffer.from(sig, "hex"))));
    expect(drawSet(sig, 4, [])).toBe(Number(h % 4n));
    expect(drawSet(sig, 4, [2])).toBe([0, 1, 3][Number(h % 3n)]);
  });

  it("never draws a burned set (property test over many signatures)", () => {
    const b = testBeacon();
    const seen = new Set<number>();
    for (let r = 1; r <= 300; r++) {
      const sig = b.sign(r);
      const burned = [r % 4, (r * 7) % 5].filter((x, i, a) => a.indexOf(x) === i);
      const d = drawSet(sig, 5, burned);
      expect(burned).not.toContain(d);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(5);
      if (burned.includes(2) === false) seen.add(d);
    }
    expect(seen.size).toBeGreaterThan(2); // the draw actually varies
    for (let r = 1; r <= 100; r++) expect(drawSet(b.sign(r), 4, [0, 1, 3])).toBe(2);
  });

  it("throws when every set is burned", () => {
    const sig = testBeacon().sign(1);
    expect(() => drawSet(sig, 3, [0, 1, 2])).toThrow(/burned/);
  });

  it("with submitted, draws only among sets that are unburned and submitted", () => {
    const b = testBeacon();
    const sig = b.sign(5);
    const h = BigInt("0x" + bytesToHex(sha256(Buffer.from(sig, "hex"))));
    // set 1 has no package, set 2 is burned: eligible [0, 3]
    expect(drawSet(sig, 4, [2], [0, 2, 3])).toBe([0, 3][Number(h % 2n)]);
    for (let r = 1; r <= 200; r++) {
      const d = drawSet(b.sign(r), 4, [2], [0, 2, 3]);
      expect([0, 3]).toContain(d);
    }
    // every set submitted: same result as without the parameter
    for (let r = 1; r <= 50; r++) expect(drawSet(b.sign(r), 4, [1], [0, 1, 2, 3])).toBe(drawSet(b.sign(r), 4, [1]));
    expect(() => drawSet(sig, 3, [0], [0])).toThrow(/submitted/);
    expect(() => drawSet(sig, 3, [], [])).toThrow(/submitted/);
  });
});

describe("recordCopyIndexes", () => {
  it("is deterministic, distinct, sorted and in range", () => {
    const sig = testBeacon().sign(9);
    const a = recordCopyIndexes(sig, 580);
    expect(a).toEqual(recordCopyIndexes(sig, 580));
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    a.forEach((i) => expect(i >= 1 && i <= 580).toBe(true));
    expect(recordCopyIndexes(sig, 2, 3)).toEqual([1, 2]);
  });
});
