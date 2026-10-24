// The five demo sets of the "Examen blanc régional de mathématiques": four committees (A to D)
// and the reserve committee (R). Ten multiple choice questions each, collège level, in French.
// Options are listed in the committee's canonical order; every centre prints its own shuffle.

export const EXAM_TITLE = "Examen blanc régional de mathématiques";
export const SUBJECT = "Mathématiques";

const RAW = {
  A: [
    ["Combien vaut 7 × 8 ?", ["56", "54", "64", "48"]],
    ["Quelle est la valeur de 3x + 5 lorsque x = 4 ?", ["17", "12", "20", "27"]],
    ["Un rectangle mesure 12 cm de long et 5 cm de large. Quelle est son aire ?", ["60 cm²", "34 cm²", "17 cm²", "120 cm²"]],
    ["Quel est le plus grand diviseur commun de 18 et 24 ?", ["6", "3", "12", "72"]],
    ["Quelle est la forme simplifiée de la fraction 15/35 ?", ["3/7", "5/7", "1/3", "3/5"]],
    ["Un moto-taxi roule à 40 km/h pendant 1 h 30. Quelle distance parcourt-il ?", ["60 km", "40 km", "70 km", "45 km"]],
    ["Quelle est la somme des mesures des angles d'un triangle ?", ["180°", "90°", "360°", "270°"]],
    ["Quelle est la solution de l'équation 2x - 7 = 9 ?", ["x = 8", "x = 1", "x = -8", "x = 16"]],
    ["Un pagne coûte 4 000 francs CFA. Avec une remise de 25 %, quel est son nouveau prix ?", ["3 000 F CFA", "3 750 F CFA", "1 000 F CFA", "2 500 F CFA"]],
    ["Lequel de ces nombres est un nombre premier ?", ["29", "27", "33", "39"]],
  ],
  B: [
    ["Combien vaut 9 × 6 + 4 ?", ["58", "90", "54", "64"]],
    ["Quel est le développement de 3(x + 2) ?", ["3x + 6", "3x + 2", "x + 6", "3x + 5"]],
    ["Quel est le périmètre d'un carré de côté 9 cm ?", ["36 cm", "81 cm", "18 cm", "27 cm"]],
    ["Combien vaut la somme 2/3 + 1/6 ?", ["5/6", "3/9", "1/3", "2/9"]],
    ["Dans un triangle rectangle, les côtés de l'angle droit mesurent 6 cm et 8 cm. Combien mesure l'hypoténuse ?", ["10 cm", "14 cm", "12 cm", "48 cm"]],
    ["Quel est le carré de 13 ?", ["169", "26", "139", "196"]],
    ["Une classe de 40 élèves compte 24 filles. Quel est le pourcentage de filles ?", ["60 %", "40 %", "24 %", "16 %"]],
    ["Combien de minutes y a-t-il dans 2,5 heures ?", ["150 min", "125 min", "250 min", "90 min"]],
    ["Quelle est la médiane de la série 3, 7, 8, 12, 15 ?", ["8", "9", "7", "12"]],
    ["Un cercle a un rayon de 5 cm. Combien mesure son diamètre ?", ["10 cm", "5 cm", "25 cm", "15,7 cm"]],
  ],
  C: [
    ["Combien vaut 125 divisé par 5 ?", ["25", "20", "30", "625"]],
    ["Quelle est la factorisation de 4x + 12 ?", ["4(x + 3)", "4(x + 12)", "x(4 + 12)", "12(x + 4)"]],
    ["Quelle est l'aire d'un triangle de base 10 cm et de hauteur 6 cm ?", ["30 cm²", "60 cm²", "16 cm²", "32 cm²"]],
    ["Quel est le plus petit multiple commun de 4 et 6 ?", ["12", "24", "2", "10"]],
    ["Combien vaut (-3) × (-4) + 2 ?", ["14", "-10", "10", "-14"]],
    ["Un champ de maïs de 2 hectares produit 3 tonnes par hectare. Quelle est la production totale ?", ["6 tonnes", "5 tonnes", "1,5 tonne", "3 tonnes"]],
    ["Combien d'arêtes possède un cube ?", ["12", "6", "8", "24"]],
    ["Quelle est la solution de l'équation 5x = 35 ?", ["x = 7", "x = 30", "x = 40", "x = 175"]],
    ["Quelle fraction irréductible est égale à 0,75 ?", ["3/4", "75/10", "7/5", "15/25"]],
    ["Quelle est la moyenne des nombres 10, 12 et 17 ?", ["13", "12", "39", "14"]],
  ],
  D: [
    ["Combien vaut 15 × 4 - 18 ?", ["42", "78", "60", "38"]],
    ["Quelle est la forme réduite de l'expression 5a + 3a - 2a ?", ["6a", "10a", "8a", "6a²"]],
    ["Quel est le volume d'un pavé droit de 4 cm sur 3 cm sur 2 cm ?", ["24 cm³", "9 cm³", "18 cm³", "48 cm³"]],
    ["Quelle est l'écriture scientifique de 45 000 ?", ["4,5 × 10⁴", "45 × 10³", "4,5 × 10³", "0,45 × 10⁵"]],
    ["Un bus quitte Cotonou à 7 h 45 et arrive à Bohicon à 9 h 20. Quelle est la durée du trajet ?", ["1 h 35", "1 h 25", "2 h 35", "1 h 75"]],
    ["Quelle est la racine carrée de 81 ?", ["9", "8", "40,5", "18"]],
    ["Sur une carte à l'échelle 1/100 000, quelle distance réelle représentent 3 cm ?", ["3 km", "30 km", "300 m", "0,3 km"]],
    ["Dans un triangle isocèle, les deux angles à la base mesurent 50° chacun. Combien mesure le troisième angle ?", ["80°", "100°", "50°", "130°"]],
    ["Quel est l'opposé de -7 ?", ["7", "-7", "1/7", "-1/7"]],
    ["Un sac de riz de 25 kg coûte 17 500 francs CFA. Quel est le prix d'un kilogramme ?", ["700 F CFA", "750 F CFA", "650 F CFA", "7 000 F CFA"]],
  ],
  R: [
    ["Combien vaut 12 × 12 ?", ["144", "124", "24", "132"]],
    ["Combien vaut 7 + 3 × 5 ?", ["22", "50", "15", "35"]],
    ["Quelle est l'aire d'un disque de rayon 10 cm, en prenant π = 3,14 ?", ["314 cm²", "62,8 cm²", "31,4 cm²", "100 cm²"]],
    ["Quelle est la solution de l'équation x + 9 = 4 ?", ["x = -5", "x = 5", "x = 13", "x = -13"]],
    ["Quel pourcentage correspond à la fraction 3/5 ?", ["60 %", "35 %", "30 %", "53 %"]],
    ["Un triangle a des côtés de 3 cm, 4 cm et 5 cm. Quel est son périmètre ?", ["12 cm", "60 cm", "6 cm", "9 cm"]],
    ["Combien de faces possède un prisme droit à base triangulaire ?", ["5", "6", "3", "9"]],
    ["Quel est l'arrondi de 3,467 au dixième près ?", ["3,5", "3,4", "3,47", "4"]],
    ["Un marchand achète un ananas 300 F CFA et le revend 450 F CFA. Quel est son bénéfice ?", ["150 F CFA", "750 F CFA", "450 F CFA", "50 F CFA"]],
    ["Quel est l'inverse de 4 ?", ["1/4", "-4", "0,4", "4"]],
  ],
};

/** Labels in set index order: A..D are the committees' sets, R (index 4) the reserve set. */
export const SET_LABELS = ["A", "B", "C", "D", "R"];

/** ExamSet of a label, in the format of @sealhour/seal (parseExamSet). */
export function demoSet(label) {
  const raw = RAW[label];
  if (!raw) throw new Error(`unknown set label ${label}`);
  return {
    examTitle: EXAM_TITLE,
    subject: SUBJECT,
    setLabel: label === "R" ? "Jeu R (réserve)" : `Jeu ${label}`,
    questions: raw.map(([text, options], i) => ({ id: `${label}-q${i + 1}`, text, options })),
  };
}
