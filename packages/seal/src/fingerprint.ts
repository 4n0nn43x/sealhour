// Typographic fingerprint: every centre prints the drawn set in its own order and layout, derived
// from H(centreId || r_c || signature). centreId in the seed means two centres never share a
// fingerprint, even if one copied the other's r_c commitment. r_c stays secret (tlocked) until the reveal round, so nobody can
// recompute a centre's rendering before then; after reveal, anyone can.
import { sha256 } from "@noble/hashes/sha256";
import type { ExamSet } from "./exam.js";
import { concatBytes, hexToBytes, toBytes32, uint32BE } from "./util.js";

export interface Rendering {
  text: string;
  /** order[k] = canonical index of the question printed at position k. */
  order: number[];
  /** optionOrders[q][k] = canonical index of the option printed at position k, for canonical question q. */
  optionOrders: number[][];
  /** Per printed question: "<bullet><spaces><blank line>" digits, joined by "-". */
  marks: string;
}

/** Option label styles. Index 0 is the canonical style used by renderPlain. */
export const BULLET_STYLES: ((letter: string) => string)[] = [
  (l) => `${l})`,
  (l) => `${l}.`,
  (l) => `(${l.toLowerCase()})`,
  (l) => `${l.toLowerCase()})`,
  (l) => `[${l}]`,
];
const SPACING_VARIANTS = 3; // 1, 2 or 3 spaces after the label
const BLANK_VARIANTS = 2; // blank line after the question text, or not

/** Counter mode sha256 stream: block i = sha256(seed || uint32_be(i)). */
class Prng {
  private counter = 0;
  private buf: Uint8Array = new Uint8Array(0);
  private pos = 0;
  constructor(private readonly seed: Uint8Array) {}
  private nextUint32(): number {
    if (this.pos + 4 > this.buf.length) {
      this.buf = sha256(concatBytes(this.seed, uint32BE(this.counter++)));
      this.pos = 0;
    }
    const v = new DataView(this.buf.buffer, this.buf.byteOffset + this.pos, 4).getUint32(0);
    this.pos += 4;
    return v;
  }
  /** Uniform integer in [0, n) by rejection sampling. */
  below(n: number): number {
    if (n <= 1) return 0;
    const limit = Math.floor(0x100000000 / n) * n;
    for (;;) {
      const v = this.nextUint32();
      if (v < limit) return v % n;
    }
  }
  shuffle(n: number): number[] {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = this.below(i + 1);
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  }
}

function letter(k: number): string {
  return k < 26 ? String.fromCharCode(65 + k) : `Z${k - 25}`;
}

function layout(
  set: ExamSet,
  order: number[],
  optionOrders: number[][],
  marks: { bullet: number; spaces: number; blank: number }[],
): string {
  const lines: string[] = [set.examTitle, `${set.subject} / ${set.setLabel}`, ""];
  order.forEach((qi, pos) => {
    const q = set.questions[qi]!;
    const m = marks[pos]!;
    lines.push(`${pos + 1}. ${q.text}`);
    if (m.blank) lines.push("");
    optionOrders[qi]!.forEach((oi, k) => {
      lines.push(BULLET_STYLES[m.bullet]!(letter(k)) + " ".repeat(m.spaces + 1) + q.options[oi]!);
    });
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

/** Deterministic per centre rendering seeded by sha256(centreId (bytes32) || r_c || signature). */
export function renderForCentre(set: ExamSet, centreId: string, rcHex: string, signatureHex: string): Rendering {
  const prng = new Prng(
    sha256(concatBytes(hexToBytes(toBytes32(centreId)), hexToBytes(toBytes32(rcHex)), hexToBytes(signatureHex))),
  );
  const order = prng.shuffle(set.questions.length);
  const optionOrders = set.questions.map((q) => prng.shuffle(q.options.length));
  const marks = order.map(() => ({
    bullet: prng.below(BULLET_STYLES.length),
    spaces: prng.below(SPACING_VARIANTS),
    blank: prng.below(BLANK_VARIANTS),
  }));
  return {
    text: layout(set, order, optionOrders, marks),
    order,
    optionOrders,
    marks: marks.map((m) => `${m.bullet}${m.spaces}${m.blank}`).join("-"),
  };
}

/** Canonical rendering: questions and options in authored order, label "A)" and one space. */
export function renderPlain(set: ExamSet): string {
  const order = set.questions.map((_, i) => i);
  const optionOrders = set.questions.map((q) => q.options.map((_, i) => i));
  return layout(set, order, optionOrders, order.map(() => ({ bullet: 0, spaces: 0, blank: 0 })));
}
