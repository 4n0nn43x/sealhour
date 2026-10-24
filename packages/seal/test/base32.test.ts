import { describe, expect, it } from "vitest";
import { decodeSignature, encodeSignature } from "../src/index.js";
import { testBeacon } from "./fixtures.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U";

describe("base32 Crockford with check characters", () => {
  const b = testBeacon();

  it("round trips 48 byte signatures, tolerant of case, dashes, spaces and I/L/O", () => {
    for (let r = 1; r <= 50; r++) {
      const sig = b.sign(r);
      const enc = encodeSignature(sig);
      expect(decodeSignature(enc)).toBe(sig);
      const sloppy = enc.toLowerCase().replace(/ /g, "-").replace(/1/g, "l").replace(/0/g, "o");
      expect(decodeSignature("  " + sloppy + " ")).toBe(sig);
      expect(decodeSignature(enc.replace(/ /g, ""))).toBe(sig);
    }
    expect(encodeSignature(b.sign(1)).replace(/ /g, "").length).toBe(77 + 20); // 77 data + 20 check chars
  });

  it("detects every single character substitution", () => {
    const enc = encodeSignature(b.sign(7));
    for (let i = 0; i < enc.length; i++) {
      if (enc[i] === " ") continue;
      for (const c of ALPHABET) {
        const a = enc[i]!;
        const same = c === a || (c === "U" && a === "U");
        if (same) continue;
        const typo = enc.slice(0, i) + c + enc.slice(i + 1);
        expect(() => decodeSignature(typo), `pos ${i} ${a}->${c}`).toThrow();
      }
    }
  });

  it("rejects a missing character", () => {
    const enc = encodeSignature(b.sign(8)).replace(/ /g, "");
    expect(() => decodeSignature(enc.slice(0, -1))).toThrow();
    expect(() => decodeSignature(enc.slice(1))).toThrow();
  });
});
