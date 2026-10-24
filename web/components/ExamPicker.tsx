"use client";
// Exam identifier field: the demo exam by default, any bytes32 or label (hashed) otherwise.
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { toBytes32Id } from "@/lib/ids";
import { Field, Hex } from "./ui";

export function useExamId(defaultId: string) {
  const [text, setText] = useState(defaultId);
  let examId = defaultId;
  try {
    examId = text.trim() ? toBytes32Id(text) : defaultId;
  } catch {
    examId = defaultId;
  }
  return { text, setText, examId };
}

export function ExamPicker({ text, setText, examId, title }: { text: string; setText: (s: string) => void; examId: string; title?: string }) {
  const { t } = useI18n();
  return (
    <Field label={t("exam.idLabel")} htmlFor="exam-id" hint={t("exam.idHint")}>
      <input id="exam-id" className="form-control" value={text} onChange={(e) => setText(e.target.value)} />
      <p className="text-muted mb-0 mt-1">
        {title ? <strong>{title} </strong> : null}
        <Hex value={examId} head={10} tail={8} />
      </p>
    </Field>
  );
}
