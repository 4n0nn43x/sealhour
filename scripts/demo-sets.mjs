// The five demo sets of the "Regional mock mathematics exam": four committees (A to D)
// and the reserve committee (R). Ten multiple choice questions each, lower secondary level, in English.
// Options are listed in the committee's canonical order; every centre prints its own shuffle.

export const EXAM_TITLE = "Regional mock mathematics exam";
export const SUBJECT = "Mathematics";

const RAW = {
  A: [
    ["What is 7 × 8?", ["56", "54", "64", "48"]],
    ["What is the value of 3x + 5 when x = 4?", ["17", "12", "20", "27"]],
    ["A rectangle is 12 cm long and 5 cm wide. What is its area?", ["60 cm²", "34 cm²", "17 cm²", "120 cm²"]],
    ["What is the greatest common divisor of 18 and 24?", ["6", "3", "12", "72"]],
    ["What is the simplest form of the fraction 15/35?", ["3/7", "5/7", "1/3", "3/5"]],
    ["A cyclist rides at 40 km/h for 1 h 30 min. How far does she travel?", ["60 km", "40 km", "70 km", "45 km"]],
    ["What is the sum of the angles of a triangle?", ["180°", "90°", "360°", "270°"]],
    ["What is the solution of the equation 2x - 7 = 9?", ["x = 8", "x = 1", "x = -8", "x = 16"]],
    ["A jacket costs $40. With a 25% discount, what is its new price?", ["$30", "$37.50", "$10", "$25"]],
    ["Which of these numbers is a prime number?", ["29", "27", "33", "39"]],
  ],
  B: [
    ["What is 9 × 6 + 4?", ["58", "90", "54", "64"]],
    ["What is the expansion of 3(x + 2)?", ["3x + 6", "3x + 2", "x + 6", "3x + 5"]],
    ["What is the perimeter of a square with side 9 cm?", ["36 cm", "81 cm", "18 cm", "27 cm"]],
    ["What is the sum 2/3 + 1/6?", ["5/6", "3/9", "1/3", "2/9"]],
    ["In a right triangle, the two sides of the right angle are 6 cm and 8 cm. How long is the hypotenuse?", ["10 cm", "14 cm", "12 cm", "48 cm"]],
    ["What is the square of 13?", ["169", "26", "139", "196"]],
    ["A class of 40 pupils has 24 girls. What percentage of the class are girls?", ["60%", "40%", "24%", "16%"]],
    ["How many minutes are there in 2.5 hours?", ["150 min", "125 min", "250 min", "90 min"]],
    ["What is the median of the series 3, 7, 8, 12, 15?", ["8", "9", "7", "12"]],
    ["A circle has a radius of 5 cm. What is its diameter?", ["10 cm", "5 cm", "25 cm", "15.7 cm"]],
  ],
  C: [
    ["What is 125 divided by 5?", ["25", "20", "30", "625"]],
    ["What is the factorisation of 4x + 12?", ["4(x + 3)", "4(x + 12)", "x(4 + 12)", "12(x + 4)"]],
    ["What is the area of a triangle with base 10 cm and height 6 cm?", ["30 cm²", "60 cm²", "16 cm²", "32 cm²"]],
    ["What is the least common multiple of 4 and 6?", ["12", "24", "2", "10"]],
    ["What is (-3) × (-4) + 2?", ["14", "-10", "10", "-14"]],
    ["A 2 hectare maize field yields 3 tonnes per hectare. What is the total yield?", ["6 tonnes", "5 tonnes", "1.5 tonnes", "3 tonnes"]],
    ["How many edges does a cube have?", ["12", "6", "8", "24"]],
    ["What is the solution of the equation 5x = 35?", ["x = 7", "x = 30", "x = 40", "x = 175"]],
    ["Which fraction in lowest terms is equal to 0.75?", ["3/4", "75/10", "7/5", "15/25"]],
    ["What is the mean of the numbers 10, 12 and 17?", ["13", "12", "39", "14"]],
  ],
  D: [
    ["What is 15 × 4 - 18?", ["42", "78", "60", "38"]],
    ["What is the simplified form of the expression 5a + 3a - 2a?", ["6a", "10a", "8a", "6a²"]],
    ["What is the volume of a cuboid measuring 4 cm by 3 cm by 2 cm?", ["24 cm³", "9 cm³", "18 cm³", "48 cm³"]],
    ["What is 45,000 in scientific notation?", ["4.5 × 10⁴", "45 × 10³", "4.5 × 10³", "0.45 × 10⁵"]],
    ["A bus leaves Northgate at 7:45 and arrives in Maplewood at 9:20. How long is the journey?", ["1 h 35 min", "1 h 25 min", "2 h 35 min", "1 h 75 min"]],
    ["What is the square root of 81?", ["9", "8", "40.5", "18"]],
    ["On a map at scale 1:100,000, what real distance do 3 cm represent?", ["3 km", "30 km", "300 m", "0.3 km"]],
    ["In an isosceles triangle, the two base angles are 50° each. What is the third angle?", ["80°", "100°", "50°", "130°"]],
    ["What is the opposite of -7?", ["7", "-7", "1/7", "-1/7"]],
    ["A 25 kg bag of rice costs $87.50. What is the price of one kilogram?", ["$3.50", "$3.75", "$3.25", "$35"]],
  ],
  R: [
    ["What is 12 × 12?", ["144", "124", "24", "132"]],
    ["What is 7 + 3 × 5?", ["22", "50", "15", "35"]],
    ["What is the area of a disc of radius 10 cm, taking π = 3.14?", ["314 cm²", "62.8 cm²", "31.4 cm²", "100 cm²"]],
    ["What is the solution of the equation x + 9 = 4?", ["x = -5", "x = 5", "x = 13", "x = -13"]],
    ["What percentage is the fraction 3/5?", ["60%", "35%", "30%", "53%"]],
    ["A triangle has sides of 3 cm, 4 cm and 5 cm. What is its perimeter?", ["12 cm", "60 cm", "6 cm", "9 cm"]],
    ["How many faces does a right triangular prism have?", ["5", "6", "3", "9"]],
    ["What is 3.467 rounded to the nearest tenth?", ["3.5", "3.4", "3.47", "4"]],
    ["A trader buys a pineapple for $3.00 and sells it for $4.50. What is the profit?", ["$1.50", "$7.50", "$4.50", "$0.50"]],
    ["What is the reciprocal of 4?", ["1/4", "-4", "0.4", "4"]],
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
    setLabel: label === "R" ? "Set R (reserve)" : `Set ${label}`,
    questions: raw.map(([text, options], i) => ({ id: `${label}-q${i + 1}`, text, options })),
  };
}
