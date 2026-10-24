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
  (a, b) => [`Combien vaut ${a} multiplié par ${b} ?`, [`${a * b}`, `${a * b + 1}`, `${a + b}`, `${a * b - 2}`]],
  (a, b) => [`Résoudre l'équation ${a}x + ${b} = ${a * 3 + b} pour trouver x.`, ["x = 3", "x = 2", "x = 4", "x = 1"]],
  (a, b) => [`Quel est le périmètre d'un rectangle de longueur ${a + 5} cm et de largeur ${b} cm ?`, [`${2 * (a + 5 + b)} cm`, `${(a + 5) * b} cm`, `${a + 5 + b} cm`, `${2 * (a + 5) * b} cm`]],
  (a, b) => [`Un commerçant de Dantokpa vend ${a * 10} oranges le matin et ${b * 10} le soir. Combien en a-t-il vendu en tout ?`, [`${(a + b) * 10}`, `${(a + b) * 10 - 10}`, `${a * b * 10}`, `${(a + b) * 10 + 5}`]],
  (a, b) => [`Quelle fraction est égale à ${a}/${a * b} une fois simplifiée ?`, [`1/${b}`, `${a}/${b}`, `1/${a}`, `${b}/${a}`]],
  (a, b) => [`L'aire d'un carré de côté ${a + b} m vaut combien de mètres carrés ?`, [`${(a + b) ** 2} m²`, `${4 * (a + b)} m²`, `${2 * (a + b)} m²`, `${(a + b) ** 2 + 1} m²`]],
  (a, b) => [`Quelle est la moyenne des notes ${a + 8}, ${b + 9} et ${a + b + 7} sur vingt ?`, [`${((a + 8 + b + 9 + a + b + 7) / 3).toFixed(1)}`, "12", "10", "15"]],
  (a, b) => [`Un moto-taxi parcourt ${a * 12} km en ${b} heures. Quelle est sa vitesse moyenne en km par heure ?`, [`${((a * 12) / b).toFixed(1)}`, `${a * 12 * b}`, `${a * 12 + b}`, `${a * 12}`]],
  (a, b) => [`Combien de diviseurs entiers positifs possède le nombre ${a * b * 6} ?`, ["8", "6", "12", "4"]],
  (a, b) => [`Le prix d'un cahier passe de ${a * 100} à ${a * 100 + b * 25} francs CFA. Quel est le pourcentage d'augmentation ?`, [`${((b * 25) / (a * 100) * 100).toFixed(0)} %`, `${b * 25} %`, "5 %", "50 %"]],
];

/** A 10 question French maths set; different seeds give different numbers (same subject). */
export function makeSet(label: string, seed: number): ExamSet {
  return {
    examTitle: "Examen blanc régional de mathématiques",
    subject: "Mathématiques",
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

export const SETS = [makeSet("Jeu A", 1), makeSet("Jeu B", 2), makeSet("Jeu C", 3), makeSet("Jeu D", 4)];

export function centreId(n: number): string {
  return "0x" + n.toString(16).padStart(64, "0");
}
