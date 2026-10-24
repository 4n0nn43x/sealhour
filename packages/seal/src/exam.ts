// Exam set format and validation.
export type Question = { id: string; text: string; options: string[] };
export type ExamSet = { examTitle: string; subject: string; setLabel: string; questions: Question[] };

function nonEmptyString(v: unknown, what: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new Error(`invalid exam set: ${what} must be a non empty string`);
  return v;
}

/** Validate an already parsed value as an ExamSet and return a clean copy (unknown keys dropped). */
export function validateExamSet(value: unknown): ExamSet {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("invalid exam set: expected an object");
  const v = value as Record<string, unknown>;
  const examTitle = nonEmptyString(v.examTitle, "examTitle");
  const subject = nonEmptyString(v.subject, "subject");
  const setLabel = nonEmptyString(v.setLabel, "setLabel");
  if (!Array.isArray(v.questions) || v.questions.length === 0) throw new Error("invalid exam set: questions must be a non empty array");
  const ids = new Set<string>();
  const questions: Question[] = v.questions.map((q: unknown, i: number) => {
    if (typeof q !== "object" || q === null) throw new Error(`invalid exam set: question ${i} must be an object`);
    const qq = q as Record<string, unknown>;
    const id = nonEmptyString(qq.id, `questions[${i}].id`);
    if (ids.has(id)) throw new Error(`invalid exam set: duplicate question id ${id}`);
    ids.add(id);
    const text = nonEmptyString(qq.text, `questions[${i}].text`);
    if (!Array.isArray(qq.options) || qq.options.length < 2) throw new Error(`invalid exam set: questions[${i}].options needs at least 2 options`);
    const options = qq.options.map((o: unknown, j: number) => nonEmptyString(o, `questions[${i}].options[${j}]`));
    if (new Set(options).size !== options.length) throw new Error(`invalid exam set: questions[${i}] has duplicate options`);
    return { id, text, options };
  });
  return { examTitle, subject, setLabel, questions };
}

/** Parse and validate an ExamSet from JSON. Throws a descriptive Error when invalid. */
export function parseExamSet(json: string): ExamSet {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (e) {
    throw new Error(`invalid exam set: not JSON (${(e as Error).message})`);
  }
  return validateExamSet(value);
}

/** Canonical JSON serialization (fixed key order), the plaintext sealed for centres. */
export function serializeExamSet(set: ExamSet): string {
  const s = validateExamSet(set);
  return JSON.stringify(s);
}
