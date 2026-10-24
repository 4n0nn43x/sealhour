import { describe, expect, it } from "vitest";
import {
  BadSignatureError,
  TooEarlyError,
  WrongKeyError,
  commitRc,
  createLocalBeacon,
  generateCentreKey,
  merkleProof,
  merkleRoot,
  newRc,
  offlineClient,
  openForCentre,
  openRc,
  tlockText,
  openText,
  parseExamSet,
  sealForCentre,
  sealPackage,
  tlockHeader,
  tlockRc,
  verifyProof,
  type ChainClient,
} from "../src/index.js";
import { SETS, centreId, testBeacon, waitForRound } from "./fixtures.js";

const dec = new TextDecoder();

describe("double lock tlock(age)", () => {
  it("refuses before the round, then opens with the centre key only", async () => {
    const b = testBeacon();
    const k1 = await generateCentreKey();
    const k2 = await generateCentreKey();
    const round = b.currentRound() + 2;
    const ct = await sealForCentre({ plaintext: "Sujet A", recipient: k1.recipient, round, client: b.client() });
    expect(tlockHeader(ct)).toEqual({ round, chainHash: b.info.hash });

    await expect(openForCentre({ ciphertext: ct, identity: k1.identity, client: b.client() })).rejects.toBeInstanceOf(TooEarlyError);
    // A client that ignores time still cannot obtain the future signature.
    await expect(b.client().get(round)).rejects.toBeInstanceOf(TooEarlyError);

    await waitForRound(b, round);
    await expect(openForCentre({ ciphertext: ct, identity: k2.identity, client: b.client() })).rejects.toBeInstanceOf(WrongKeyError);
    await expect(openForCentre({ ciphertext: ct, identity: "", client: b.client() })).rejects.toBeInstanceOf(WrongKeyError);
    const out = await openForCentre({ ciphertext: ct, identity: k1.identity, client: b.client() });
    expect(dec.decode(out)).toBe("Sujet A");
  });

  it("opens offline from the signature alone and rejects a corrupted signature", async () => {
    const b = testBeacon();
    const k = await generateCentreKey();
    const round = b.currentRound() - 1; // already emitted
    const ct = await sealForCentre({ plaintext: "hors ligne", recipient: k.recipient, round, client: b.client() });
    const sig = b.sign(round);

    // offline: no network client at all, only info + signature
    const out = await openForCentre({ ciphertext: ct, identity: k.identity, client: offlineClient(b.info, round, sig) });
    expect(dec.decode(out)).toBe("hors ligne");

    const flipped = sig.slice(0, 20) + (sig[20] === "0" ? "1" : "0") + sig.slice(21);
    expect(() => offlineClient(b.info, round, flipped)).toThrow(BadSignatureError);
    expect(() => offlineClient(b.info, round + 1, sig)).toThrow(BadSignatureError); // right sig, wrong round
    const other = createLocalBeacon({ genesisTime: b.info.genesis_time, period: 1 });
    expect(() => offlineClient(b.info, round, other.sign(round))).toThrow(BadSignatureError); // other key
  });

  it("rejects a relay serving a corrupted signature with BadSignatureError", async () => {
    const b = testBeacon();
    const k = await generateCentreKey();
    const round = b.currentRound() - 1;
    const ct = await sealForCentre({ plaintext: "x", recipient: k.recipient, round, client: b.client() });
    const honest = b.client();
    const other = createLocalBeacon({ genesisTime: b.info.genesis_time, period: 1 });
    const evil = {
      options: honest.options,
      chain: () => honest.chain(),
      latest: () => honest.latest(),
      async get(r: number) {
        return { round: r, randomness: "00", signature: other.sign(r) };
      },
    } as unknown as ChainClient;
    await expect(openForCentre({ ciphertext: ct, identity: k.identity, client: evil })).rejects.toBeInstanceOf(BadSignatureError);
    // and a beacon of another network is refused before any decryption
    await expect(openForCentre({ ciphertext: ct, identity: k.identity, client: other.client() })).rejects.toBeInstanceOf(BadSignatureError);
  });

  it("sealPackage: root is the Merkle root of the leaves and every proof verifies; centres open their copy", async () => {
    const b = testBeacon();
    const keys = await Promise.all([1, 2, 3].map(() => generateCentreKey()));
    const centres = keys.map((k, i) => ({ centreId: centreId(i + 1), recipient: k.recipient }));
    const round = b.currentRound() - 1;
    const pkg = await sealPackage({ set: SETS[0]!, centres, round, client: b.client() });
    const leaves = pkg.items.map((i) => i.leaf);
    expect(pkg.root).toBe(merkleRoot(leaves));
    leaves.forEach((leaf, i) => expect(verifyProof(leaf, merkleProof(leaves, i), pkg.root)).toBe(true));
    expect(verifyProof(leaves[0]!, merkleProof(leaves, 1), pkg.root)).toBe(false);
    const opened = await openForCentre({ ciphertext: pkg.items[1]!.ciphertext, identity: keys[1]!.identity, client: b.client() });
    expect(parseExamSet(dec.decode(opened))).toEqual(SETS[0]);
    await expect(openForCentre({ ciphertext: pkg.items[1]!.ciphertext, identity: keys[0]!.identity, client: b.client() })).rejects.toBeInstanceOf(WrongKeyError);
  });

  it("detects a centre whose tlocked r_c does not match its commitment", async () => {
    const b = testBeacon();
    const reveal = b.currentRound() + 1;
    const rc = newRc();
    const lie = newRc();
    const commit = commitRc(rc);
    const honest = await tlockRc(rc, reveal, b.client());
    const lying = await tlockRc(lie, reveal, b.client());
    await expect(openRc({ tlocked: honest, client: b.client() })).rejects.toBeInstanceOf(TooEarlyError);
    await waitForRound(b, reveal);
    expect(commitRc(await openRc({ tlocked: honest, client: b.client() }))).toBe(commit);
    const revealed = await openRc({ tlocked: lying, client: b.client() });
    expect(revealed).toBe(lie);
    expect(commitRc(revealed)).not.toBe(commit);
  });

  it("opens a public tlocked text only after its round", async () => {
    const b = testBeacon();
    const round = b.currentRound() + 1;
    const ct = await tlockText("Jeu A, version publique", round, b.client());
    await expect(openText({ tlocked: ct, client: b.client() })).rejects.toBeInstanceOf(TooEarlyError);
    await waitForRound(b, round);
    expect(await openText({ tlocked: ct, client: b.client() })).toBe("Jeu A, version publique");
  });
});
