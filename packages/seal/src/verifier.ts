// Dated leak attribution.
//  - Text attested BEFORE the opening round of its set (the reserve has its own): only the committee
//    that wrote the set had it, so the closest set designates its committee (a committee, never a person).
//  - Text seen AFTER opening: the drawn set was in every centre. A rendering whose question order,
//    option order and typographic marks match one centre's fingerprint designates that centre;
//    otherwise the leak is "unattributed" (retyped, reordered or too partial). The drawn set never
//    designates its committee after the opening round.
//  - Text seen AT OR AFTER the reveal round: every r_c and the signature are public, so anyone can
//    compute any centre's rendering. Such a text is "unattributed", never a centre.
import type { ExamSet } from "./exam.js";
import { renderForCentre, renderPlain } from "./fingerprint.js";

/**
 * Thresholds, chosen on the demo data and documented here:
 *  - SET_MATCH: word 3-gram Jaccard between the leak and a set. Any rendering of a set (any centre,
 *    canonical or retyped) scores close to 1 because grams are computed per line with labels
 *    stripped; an unrelated text on the same subject stays well below 0.1. 0.35 tolerates OCR
 *    noise and a partial leak of about a third of the paper.
 *  - CENTRE_MATCH: weighted agreement of question order, option order and marks with a centre
 *    rendering. A real photo scores 1; a wrong centre averages about 0.45 and reaches 0.9 with
 *    negligible probability for a 10 question set.
 *  - CENTRE_MARGIN: the best centre must beat the second by this much, else "unattributed".
 *  - MIN_QUESTIONS: fewer recognised questions than this is too little evidence for a centre.
 */
export const VERIFIER_THRESHOLDS = {
  SET_MATCH: 0.35,
  CENTRE_MATCH: 0.9,
  CENTRE_MARGIN: 0.1,
  MIN_QUESTIONS: 3,
} as const;

const WEIGHTS = { questionOrder: 0.5, optionOrder: 0.3, marks: 0.2 };

export type LeakVerdict = {
  verdict: "committee" | "centre" | "unattributed" | "no-match";
  setIndex?: number;
  centreId?: string;
  score: number;
};

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(s: string): string[] {
  const n = normalizeText(s);
  return n === "" ? [] : n.split(" ");
}

function grams(toks: string[], n = 3): string[] {
  if (toks.length === 0) return [];
  if (toks.length < n) return [toks.join(" ")];
  const out: string[] = [];
  for (let i = 0; i + n <= toks.length; i++) out.push(toks.slice(i, i + n).join(" "));
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

// Leading label of a printed line: "12." "3)" "A)" "b." "(c)" "[D]".
const LABEL_RE = /^\s*(?:\d+\s*[.)]|\(\s*[a-zA-Z]\s*\)|\[\s*[a-zA-Z]\s*\]|[a-zA-Z]\s*[.)])/;

function stripLabel(line: string): string {
  return line.replace(LABEL_RE, "");
}

/** Gram set of a text treated line by line, labels stripped (layout independent). */
function lineGrams(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) for (const g of grams(tokens(stripLabel(line)))) out.add(g);
  return out;
}

function flatGrams(text: string): Set<string> {
  return new Set(grams(tokens(text)));
}

/** Similarity of a leak to a set: best of the line based and the flat 3-gram Jaccard. */
function setSimilarity(leak: string, set: ExamSet): number {
  const plain = renderPlain(set);
  return Math.max(jaccard(lineGrams(leak), lineGrams(plain)), jaccard(flatGrams(leak), flatGrams(plain)));
}

type Observation = {
  order: number[]; // canonical question indexes in leak order
  options: Map<number, number[]>; // canonical question -> canonical option indexes in leak order
  marks: Map<number, { bullet?: number; spaces?: number; blank?: number }>;
};

// Raw label patterns of BULLET_STYLES, same indexes, capturing the spaces after the label.
const BULLET_RES = [/^[A-Z]\)( +)/, /^[A-Z]\.( +)/, /^\([a-z]\)( +)/, /^[a-z]\)( +)/, /^\[[A-Z]\]( +)/];

function detectBullet(raw: string): { bullet?: number; spaces?: number } {
  for (let b = 0; b < BULLET_RES.length; b++) {
    const m = BULLET_RES[b]!.exec(raw);
    if (m) return { bullet: b, spaces: m[1]!.length - 1 };
  }
  return {};
}

/** Recover question order, option order and marks of the drawn set from a leaked text. */
function observe(leak: string, set: ExamSet): Observation {
  const qNorm = set.questions.map((q) => normalizeText(q.text));
  const qGrams = set.questions.map((q) => new Set(grams(tokens(q.text))));
  const optNorm = set.questions.map((q) => q.options.map(normalizeText));
  const obs: Observation = { order: [], options: new Map(), marks: new Map() };
  const lines = leak.split(/\r?\n/);
  let current = -1;
  let afterQuestion = false;
  for (const raw of lines) {
    const content = normalizeText(stripLabel(raw));
    if (content === "") {
      if (afterQuestion && current >= 0) obs.marks.get(current)!.blank = 1;
      continue;
    }
    // Question line?
    let qi = qNorm.indexOf(content);
    if (qi < 0) {
      const g = new Set(grams(content.split(" ")));
      let best = 0;
      qGrams.forEach((qg, i) => {
        const s = jaccard(g, qg);
        if (s > best) [best, qi] = [s, i];
      });
      if (best < 0.6) qi = -1;
    }
    if (qi >= 0 && !obs.options.has(qi)) {
      if (afterQuestion && current >= 0 && obs.marks.get(current)!.blank === undefined) obs.marks.get(current)!.blank = 0;
      obs.order.push(qi);
      obs.options.set(qi, []);
      obs.marks.set(qi, {});
      current = qi;
      afterQuestion = true;
      continue;
    }
    if (current < 0) continue;
    // Option line of the current question?
    const oi = optNorm[current]!.indexOf(content);
    if (oi >= 0) {
      const opts = obs.options.get(current)!;
      const mark = obs.marks.get(current)!;
      if (afterQuestion) {
        if (mark.blank === undefined) mark.blank = 0;
        const bs = detectBullet(raw.trimStart());
        if (bs.bullet !== undefined) {
          mark.bullet = bs.bullet;
          mark.spaces = bs.spaces;
        }
      }
      afterQuestion = false;
      if (!opts.includes(oi)) opts.push(oi);
    }
  }
  return obs;
}

/** Concordant pairs of the observed sequence against a reference order (reference[k] = index at position k). */
function concordance(observed: number[], reference: number[]): { agree: number; pairs: number } {
  const pos = new Map<number, number>();
  reference.forEach((v, k) => pos.set(v, k));
  let agree = 0;
  let pairs = 0;
  for (let i = 0; i < observed.length; i++)
    for (let j = i + 1; j < observed.length; j++) {
      pairs++;
      if (pos.get(observed[i]!)! < pos.get(observed[j]!)!) agree++;
    }
  return { agree, pairs };
}

function centreScore(obs: Observation, set: ExamSet, centreId: string, rcHex: string, signatureHex: string): number {
  const r = renderForCentre(set, centreId, rcHex, signatureHex);
  const parts: { w: number; v: number }[] = [];
  const q = concordance(obs.order, r.order);
  if (q.pairs > 0) parts.push({ w: WEIGHTS.questionOrder, v: q.agree / q.pairs });
  let oa = 0;
  let op = 0;
  for (const [qi, opts] of obs.options) {
    const c = concordance(opts, r.optionOrders[qi]!);
    oa += c.agree;
    op += c.pairs;
  }
  if (op > 0) parts.push({ w: WEIGHTS.optionOrder, v: oa / op });
  const markCodes = r.marks.split("-");
  let ma = 0;
  let mt = 0;
  for (const [qi, m] of obs.marks) {
    const code = markCodes[r.order.indexOf(qi)]!;
    const ref = { bullet: Number(code[0]), spaces: Number(code[1]), blank: Number(code[2]) };
    for (const k of ["bullet", "spaces", "blank"] as const) {
      if (m[k] === undefined) continue;
      mt++;
      if (m[k] === ref[k]) ma++;
    }
  }
  if (mt > 0) parts.push({ w: WEIGHTS.marks, v: ma / mt });
  const w = parts.reduce((s, p) => s + p.w, 0);
  return w === 0 ? 0 : parts.reduce((s, p) => s + p.w * p.v, 0) / w;
}

export function attributeLeak(p: {
  leakedText: string;
  seenAtMs: number;
  openRoundTimeMs: number;
  /** Time of the reveal round: from then on renderings are computable by anyone. */
  revealRoundTimeMs: number;
  /** openTimeMs: the set's own opening time (the reserve opens later), default openRoundTimeMs. */
  sets: { setIndex: number; set: ExamSet; openTimeMs?: number }[];
  drawnSet: number;
  signatureHex: string;
  centres: { centreId: string; rcHex: string }[];
}): LeakVerdict {
  const T = VERIFIER_THRESHOLDS;
  const scored = p.sets.map((s) => ({
    setIndex: s.setIndex,
    set: s.set,
    openTimeMs: s.openTimeMs ?? p.openRoundTimeMs,
    score: setSimilarity(p.leakedText, s.set),
  }));
  scored.sort((a, b) => b.score - a.score || a.setIndex - b.setIndex);
  const best = scored[0];
  if (!best || best.score < T.SET_MATCH) return { verdict: "no-match", score: best?.score ?? 0 };

  if (p.seenAtMs < best.openTimeMs) {
    // Before its own opening only the authoring committee held the set.
    return { verdict: "committee", setIndex: best.setIndex, score: best.score };
  }

  if (p.seenAtMs >= p.revealRoundTimeMs) {
    // After reveal, renderings are computable by anyone (public r_c and signature): no accusation.
    return { verdict: "unattributed", setIndex: best.setIndex, score: best.score };
  }

  // After opening: only the drawn set was in the centres. Never accuse its committee.
  const drawn = scored.find((s) => s.setIndex === p.drawnSet);
  if (!drawn || drawn.score < T.SET_MATCH) {
    // Another (undrawn) set surfaced after opening. Every set is sealed to every centre for the open
    // round, so centres could open it too: the leak is not attributable to one holder; stay conservative.
    return { verdict: "unattributed", setIndex: best.setIndex, score: best.score };
  }
  const obs = observe(p.leakedText, drawn.set);
  if (obs.order.length < T.MIN_QUESTIONS || p.centres.length === 0) {
    return { verdict: "unattributed", setIndex: drawn.setIndex, score: 0 };
  }
  const ranked = p.centres
    .map((c) => ({ centreId: c.centreId, score: centreScore(obs, drawn.set, c.centreId, c.rcHex, p.signatureHex) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0]!;
  const second = ranked[1]?.score ?? 0;
  if (top.score >= T.CENTRE_MATCH && top.score - second >= T.CENTRE_MARGIN) {
    return { verdict: "centre", setIndex: drawn.setIndex, centreId: top.centreId, score: top.score };
  }
  return { verdict: "unattributed", setIndex: drawn.setIndex, score: top.score };
}
