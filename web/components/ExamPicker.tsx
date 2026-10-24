"use client";
// Exam identifier: the demo exam by default, any bytes32 or label (hashed) otherwise. ExamCard is the side card
// of the office and committee pages: exam name, its dated milestones, and "Use another exam" in a collapsible.
import { useState } from "react";
import { useConfig } from "./Providers";
import { ExamCardHeader, Timeline, VerifyDetails } from "./blocks";
import { useI18n } from "@/lib/i18n";
import { toBytes32Id } from "@/lib/ids";
import type { ExamSnapshot } from "@/lib/registry";
import { examMilestones, usePhase } from "@/lib/usePhase";
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

export type ExamIdState = ReturnType<typeof useExamId>;

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

/** Side card: which exam, when it opens (timeline), and the exam id field folded under "Use another exam". */
export function ExamCard({ exam, snap }: { exam: ExamIdState; snap: ExamSnapshot | null }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { b } = usePhase();
  const isDemo = exam.examId === cfg.demo.examId;
  const ms = snap?.exam.created ? examMilestones(cfg, b, snap.exam) : [];
  const next = ms.findIndex((m) => !m.reached);
  return (
    <section className="card" aria-labelledby="exam-card-title">
      <ExamCardHeader id="exam-card-title" title={isDemo ? cfg.demo.examTitle : exam.text} sub={isDemo ? cfg.demo.subject : t("examCard.custom")} />
      <div className="card-body">
        {ms.length ? (
          <Timeline items={ms.map((m, i) => ({ label: t(m.label), atMs: m.atMs, round: m.round, state: m.reached ? "done" : i === next ? "current" : "future" }))} />
        ) : (
          <p className="text-muted mb-0">{t("examCard.notCreated")}</p>
        )}
        <VerifyDetails title={t("examCard.other")} testId="other-exam" defaultOpen={!isDemo}>
          <ExamPicker {...exam} title={isDemo ? cfg.demo.examTitle : undefined} />
          {!isDemo ? (
            <button type="button" className="btn btn-sm btn-soft-primary" onClick={() => exam.setText(cfg.demo.examId)}>
              {t("examCard.backToDemo")}
            </button>
          ) : null}
        </VerifyDetails>
      </div>
    </section>
  );
}
