import { createLocalBeacon, roundTime, type ExamSet, type LocalBeacon } from "../src/index.js";

/** Local beacon for tests: period 1 s, genesis in the past. */
export function testBeacon(): LocalBeacon {
  return createLocalBeacon({ genesisTime: Math.floor(Date.now() / 1000) - 20, period: 1 });
}

export async function waitForRound(b: LocalBeacon, round: number): Promise<void> {
  const t = roundTime(b.info, round);
  while (Date.now() < t || b.currentRound() < round) await new Promise((r) => setTimeout(r, Math.max(20, t - Date.now() + 5)));
}

const TEMPLATES: ((a: number, b: number) => [string, string[]])[] = [
  (a, b) => [`What is ${a} multiplied by ${b}?`, [`${a * b}`, `${a * b + 1}`, `${a + b}`, `${a * b - 2}`]],
  (a, b) => [`Solve the equation ${a}x + ${b} = ${a * 3 + b} to find x.`, ["x = 3", "x = 2", "x = 4", "x = 1"]],
  (a, b) => [`What is the perimeter of a rectangle of length ${a + 5} cm and width ${b} cm?`, [`${2 * (a + 5 + b)} cm`, `${(a + 5) * b} cm`, `${a + 5 + b} cm`, `${2 * (a + 5) * b} cm`]],
  (a, b) => [`A café sells ${a * 10} croissants in the morning and ${b * 10} in the afternoon. How many did it sell in total?`, [`${(a + b) * 10}`, `${(a + b) * 10 - 10}`, `${a * b * 10}`, `${(a + b) * 10 + 5}`]],
  (a, b) => [`Which fraction is equal to ${a}/${a * b} once simplified?`, [`1/${b}`, `${a}/${b}`, `1/${a}`, `${b}/${a}`]],
  (a, b) => [`The area of a square with side ${a + b} m is how many square metres?`, [`${(a + b) ** 2} m²`, `${4 * (a + b)} m²`, `${2 * (a + b)} m²`, `${(a + b) ** 2 + 1} m²`]],
  (a, b) => [`What is the mean of the marks ${a + 8}, ${b + 9} and ${a + b + 7} out of twenty?`, [`${((a + 8 + b + 9 + a + b + 7) / 3).toFixed(1)}`, "12", "10", "15"]],
  (a, b) => [`A courier rides ${a * 12} km in ${b} hours. What is the average speed in km per hour?`, [`${((a * 12) / b).toFixed(1)}`, `${a * 12 * b}`, `${a * 12 + b}`, `${a * 12}`]],
  (a, b) => [`How many positive integer divisors does the number ${a * b * 6} have?`, ["8", "6", "12", "4"]],
  (a, b) => [`The price of a notebook rises from ${a * 100} to ${a * 100 + b * 25} cents. What is the percentage increase?`, [`${((b * 25) / (a * 100) * 100).toFixed(0)}%`, `${b * 25}%`, "5%", "50%"]],
];

/** A 10 question English maths set; different seeds give different numbers (same subject). */
export function makeSet(label: string, seed: number): ExamSet {
  return {
    examTitle: "Regional mock mathematics exam",
    subject: "Mathematics",
    setLabel: label,
    questions: TEMPLATES.map((t, i) => {
      const a = 2 + ((seed * 7 + i * 3) % 9);
      const b = 3 + ((seed * 5 + i * 11) % 7);
      const [text, options] = t(a, b);
      // keep options distinct whatever the numbers
      const uniq = options.map((o, k) => (options.indexOf(o) === k ? o : `${o} (${k})`));
      return { id: `${label}-q${i + 1}`, text, options: uniq };
    }),
  };
}

export const SETS = [makeSet("Set A", 1), makeSet("Set B", 2), makeSet("Set C", 3), makeSet("Set D", 4)];

export function centreId(n: number): string {
  return "0x" + n.toString(16).padStart(64, "0");
}
