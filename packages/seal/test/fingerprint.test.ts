import { describe, expect, it } from "vitest";
import { newRc, renderForCentre, renderPlain } from "../src/index.js";
import { SETS, centreId, testBeacon } from "./fixtures.js";

describe("fingerprint", () => {
  const set = SETS[0]!;
  const sig = testBeacon().sign(42);

  it("is deterministic for (set, centreId, r_c, signature) and a permutation of the set", () => {
    const rc = newRc();
    const a = renderForCentre(set, centreId(1), rc, sig);
    expect(renderForCentre(set, centreId(1), rc, sig)).toEqual(a);
    expect([...a.order].sort((x, y) => x - y)).toEqual(set.questions.map((_, i) => i));
    a.optionOrders.forEach((o, q) => expect([...o].sort((x, y) => x - y)).toEqual(set.questions[q]!.options.map((_, i) => i)));
    expect(a.marks.split("-")).toHaveLength(set.questions.length);
    for (const q of set.questions) {
      expect(a.text).toContain(q.text);
      q.options.forEach((o) => expect(a.text).toContain(o));
    }
  });

  it("differs per centre (r_c) and per signature", () => {
    const texts = new Set<string>();
    const orders = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = renderForCentre(set, centreId(1), newRc(), sig);
      texts.add(r.text);
      orders.add(r.order.join(","));
    }
    expect(texts.size).toBe(50);
    expect(orders.size).toBe(50);
    const rc = newRc();
    expect(renderForCentre(set, centreId(1), rc, sig).text).not.toBe(renderForCentre(set, centreId(1), rc, testBeacon().sign(43)).text);
  });

  it("differs per centreId even with the same r_c (a copied commitment does not copy the fingerprint)", () => {
    const rc = newRc();
    const texts = new Set<string>();
    for (let n = 1; n <= 20; n++) texts.add(renderForCentre(set, centreId(n), rc, sig).text);
    expect(texts.size).toBe(20);
  });

  it("renderPlain is canonical", () => {
    const p = renderPlain(set);
    expect(p).toBe(renderPlain(set));
    const idx = set.questions.map((q) => p.indexOf(q.text));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(p).toContain(`A) ${set.questions[0]!.options[0]}`);
  });
});
