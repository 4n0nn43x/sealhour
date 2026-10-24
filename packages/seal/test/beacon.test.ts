import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import {
  QUICKNET_PIN,
  createLocalBeacon,
  httpBeaconClient,
  infoMatchesPin,
  newRc,
  offlineClient,
  quicknetClient,
  roundAt,
  roundTime,
  tlockRc,
  verifyBeaconSignature,
} from "../src/index.js";
import { testBeacon } from "./fixtures.js";

describe("beacon", () => {
  it("local beacon uses the quicknet scheme, a real chain hash, and serves verified rounds up to now only", async () => {
    const b = testBeacon();
    expect(b.info.schemeID).toBe("bls-unchained-g1-rfc9380");
    expect(b.info.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b.info.public_key).toMatch(/^[0-9a-f]{192}$/);
    const cur = b.currentRound();
    const beacon = await b.client().get(cur);
    expect(beacon.signature).toHaveLength(96);
    expect(beacon.randomness).toBe(bytesToHex(sha256(Buffer.from(beacon.signature, "hex"))));
    expect(verifyBeaconSignature(b.info, cur, beacon.signature)).toBe(true);
    expect(verifyBeaconSignature(b.info, cur + 1, beacon.signature)).toBe(false);
    expect(verifyBeaconSignature(b.info, cur, "00")).toBe(false);
    await expect(b.client().get(cur + 5)).rejects.toThrow();
    expect((await b.client().latest()).round).toBeGreaterThanOrEqual(cur);
  });

  it("is reproducible from its secret key", () => {
    const b = testBeacon();
    const c = createLocalBeacon({ genesisTime: b.info.genesis_time, period: 1, secretKeyHex: b.secretKeyHex });
    expect(c.info).toEqual(b.info);
    expect(c.sign(3)).toBe(b.sign(3));
  });

  it("roundAt and roundTime agree with the contract convention", () => {
    const info = createLocalBeacon({ genesisTime: 1000, period: 3 }).info;
    expect(roundAt(info, 999_000)).toBe(0);
    expect(roundAt(info, 1_000_000)).toBe(1);
    expect(roundAt(info, 1_002_999)).toBe(1);
    expect(roundAt(info, 1_003_000)).toBe(2);
    expect(roundTime(info, 1)).toBe(1_000_000);
    expect(roundTime(info, 2)).toBe(1_003_000);
    expect(roundAt(info, roundTime(info, 77))).toBe(77);
  });

  it("offline client serves only the verified round", async () => {
    const b = testBeacon();
    const c = offlineClient(b.info, 4, b.sign(4));
    expect((await c.get(4)).signature).toBe(b.sign(4));
    await expect(c.get(5)).rejects.toThrow();
  });

  it("network clients can be constructed (no network call)", () => {
    expect(httpBeaconClient("http://127.0.0.1:8787/").chain().baseUrl).toBe("http://127.0.0.1:8787");
    expect(quicknetClient().chain().baseUrl).toContain("52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971");
  });

  it("quicknetClient is pinned to the quicknet chain hash and public key", () => {
    const opts = (quicknetClient() as unknown as { options: { chainVerificationParams?: unknown } }).options;
    expect(opts.chainVerificationParams).toEqual(QUICKNET_PIN);
  });

  it("a pinned httpBeaconClient rejects a relay serving the real chain hash with another public key", async () => {
    const real = testBeacon();
    const liar = createLocalBeacon({ genesisTime: real.info.genesis_time, period: 1 });
    // The lying relay keeps the real chain hash but serves its own key.
    const served = { ...liar.info, hash: real.info.hash, groupHash: real.info.hash };
    const server = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url?.endsWith("/info")) return res.end(JSON.stringify(served));
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const pin = { chainHash: real.info.hash, publicKey: real.info.public_key };
      expect(infoMatchesPin(served, pin)).toBe(false);
      await expect(httpBeaconClient(url, pin).chain().info()).rejects.toThrow();
      // Sealing through the pinned client fails instead of encrypting to the liar's key.
      await expect(tlockRc(newRc(), real.currentRound() + 50, httpBeaconClient(url, pin))).rejects.toThrow();
      // The same relay is accepted when the pin is its own chain (pin check is the only difference).
      const own = { chainHash: served.hash, publicKey: served.public_key };
      expect((await httpBeaconClient(url, own).chain().info()).public_key).toBe(liar.info.public_key);
      // 0x prefix and case in the pin do not matter.
      expect(infoMatchesPin(served, { chainHash: "0x" + served.hash.toUpperCase(), publicKey: "0x" + served.public_key })).toBe(true);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
