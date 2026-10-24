import { describe, expect, it } from "vitest";
import { Encrypter, Decrypter } from "age-encryption";
import { bytes32ToRecipient, generateCentreKey, recipientToBytes32 } from "../src/index.js";

describe("centre keys", () => {
  it("generates X25519 age keys and converts recipient <-> bytes32 losslessly", async () => {
    for (let i = 0; i < 10; i++) {
      const k = await generateCentreKey();
      expect(k.identity.startsWith("AGE-SECRET-KEY-1")).toBe(true);
      expect(k.recipient.startsWith("age1")).toBe(true);
      const b32 = recipientToBytes32(k.recipient);
      expect(b32).toMatch(/^0x[0-9a-f]{64}$/);
      expect(bytes32ToRecipient(b32)).toBe(k.recipient);
      // the reconstructed recipient is usable by age
      const e = new Encrypter();
      e.addRecipient(bytes32ToRecipient(b32));
      const d = new Decrypter();
      d.addIdentity(k.identity);
      expect(await d.decrypt(await e.encrypt("ok"), "text")).toBe("ok");
    }
  });

  it("rejects a corrupted recipient", async () => {
    const k = await generateCentreKey();
    const bad = k.recipient.slice(0, -1) + (k.recipient.endsWith("q") ? "p" : "q");
    expect(() => recipientToBytes32(bad)).toThrow();
    expect(() => recipientToBytes32("age1pq1xyz")).toThrow();
  });
});
