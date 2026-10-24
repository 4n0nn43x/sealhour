import { describe, expect, it } from "vitest";
import { VERIFIER_THRESHOLDS, attributeLeak, drawSet, newRc, renderForCentre, renderPlain, roundTime } from "../src/index.js";
import { SETS, centreId, makeSet, testBeacon } from "./fixtures.js";

describe("attributeLeak (dated rule)", () => {
  const b = testBeacon();
  const openRound = 30;
  const sig = b.sign(openRound);
  const T = roundTime(b.info, openRound);
  const sets = SETS.map((set, setIndex) => ({ setIndex, set }));
  const drawn = drawSet(sig, sets.length, []);
  const drawnSet = SETS[drawn]!;
  const centres = [1, 2, 3, 4].map((n) => ({ centreId: centreId(n), rcHex: newRc() }));
  const revealRound = openRound + 3600; // period 1 s: reveal one hour after T
  const R = roundTime(b.info, revealRound);
  const base = { openRoundTimeMs: T, revealRoundTimeMs: R, sets, drawnSet: drawn, signatureHex: sig, centres };
  const render = (c: { centreId: string; rcHex: string }) => renderForCentre(drawnSet, c.centreId, c.rcHex, sig);

  it("photo of centre 2's rendering seen after T designates centre 2", () => {
    const photo = render(centres[1]!).text;
    const v = attributeLeak({ ...base, leakedText: photo, seenAtMs: T + 10 * 60_000 });
    expect(v.verdict).toBe("centre");
    expect(v.centreId).toBe(centreId(2));
    expect(v.setIndex).toBe(drawn);
    expect(v.score).toBeGreaterThanOrEqual(VERIFIER_THRESHOLDS.CENTRE_MATCH);
  });

  it("partial photo (first half of the page) of centre 3 still designates centre 3", () => {
    const lines = render(centres[2]!).text.split("\n");
    const half = lines.slice(0, Math.ceil(lines.length / 2)).join("\n");
    const v = attributeLeak({ ...base, leakedText: half, seenAtMs: T + 1 });
    expect(v).toMatchObject({ verdict: "centre", centreId: centreId(3) });
  });

  it("every centre's own rendering points to that centre", () => {
    for (const c of centres) {
      const v = attributeLeak({ ...base, leakedText: render(c).text, seenAtMs: T + 1 });
      expect(v.centreId).toBe(c.centreId);
    }
  });

  it("set text seen before T designates the committee of that set", () => {
    const other = (drawn + 1) % SETS.length;
    const v = attributeLeak({ ...base, leakedText: renderPlain(SETS[other]!), seenAtMs: T - 3_600_000 });
    expect(v).toMatchObject({ verdict: "committee", setIndex: other });
    const v2 = attributeLeak({ ...base, leakedText: renderPlain(drawnSet), seenAtMs: T - 1 });
    expect(v2).toMatchObject({ verdict: "committee", setIndex: drawn });
  });

  it("retyped text in canonical order after T is unattributed, never the drawn set's committee", () => {
    const v = attributeLeak({ ...base, leakedText: renderPlain(drawnSet), seenAtMs: T + 5 * 60_000 });
    expect(v.verdict).toBe("unattributed");
    expect(v.centreId).toBeUndefined();
    // retyped as one paragraph, lowercase, no accents
    const flat = renderPlain(drawnSet).replace(/\n+/g, " ").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
    const v2 = attributeLeak({ ...base, leakedText: flat, seenAtMs: T + 5 * 60_000 });
    expect(v2.verdict).not.toBe("committee");
    expect(v2.verdict).not.toBe("centre");
  });

  it("a centre rendering dated at or after the reveal round is unattributed (anyone can compute it)", () => {
    const photo = render(centres[1]!).text;
    for (const seenAtMs of [R, R + 1, R + 24 * 3_600_000]) {
      const v = attributeLeak({ ...base, leakedText: photo, seenAtMs });
      expect(v.verdict).toBe("unattributed");
      expect(v.centreId).toBeUndefined();
    }
    expect(attributeLeak({ ...base, leakedText: photo, seenAtMs: R - 1 })).toMatchObject({ verdict: "centre", centreId: centreId(2) });
  });

  it("a reserve set leaked before its own opening points to the reserve committee", () => {
    const reserveIndex = SETS.length;
    const reserveSet = makeSet("Jeu R", 9);
    const RT = roundTime(b.info, revealRound + 600); // reserve opens after the main reveal
    const withReserve = { ...base, sets: [...sets, { setIndex: reserveIndex, set: reserveSet, openTimeMs: RT }] };
    for (const seenAtMs of [T - 1000, T + 60_000, R + 60_000, RT - 1]) {
      const v = attributeLeak({ ...withReserve, leakedText: renderPlain(reserveSet), seenAtMs });
      expect(v).toMatchObject({ verdict: "committee", setIndex: reserveIndex });
    }
    const after = attributeLeak({ ...withReserve, leakedText: renderPlain(reserveSet), seenAtMs: RT });
    expect(after.verdict).toBe("unattributed");
    // the regular sets keep the main opening time
    const other = (drawn + 1) % SETS.length;
    expect(attributeLeak({ ...withReserve, leakedText: renderPlain(SETS[other]!), seenAtMs: T + 60_000 }).verdict).toBe("unattributed");
  });

  it("an unrelated rumour is no-match, before or after T", () => {
    const rumour = "Le sujet de maths tombera sur la géométrie dans l'espace et les probabilités, mon cousin à Parakou l'a vu hier soir.";
    for (const seenAtMs of [T - 1000, T + 1000]) {
      const v = attributeLeak({ ...base, leakedText: rumour, seenAtMs });
      expect(v.verdict).toBe("no-match");
      expect(v.score).toBeLessThan(VERIFIER_THRESHOLDS.SET_MATCH);
    }
  });
});
