"use client";
// The committee's set: load the draft from /shared/sets, import a file or paste JSON; validated with parseExamSet.
import { useEffect, useState, type ChangeEvent } from "react";
import { parseExamSet, type ExamSet } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { fetchText, sharedUrl } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { useAction } from "@/lib/useAction";
import { Button, Field, Notice, Section } from "../ui";

export function SetEditor({ setIndex, onChange }: { setIndex: number; onChange: (set: ExamSet | null) => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const load = useAction<void>();

  const draftUrl = sharedUrl(cfg, `sets/set-${setIndex}.json`);
  const loadDraft = () =>
    load.run(async () => {
      setText(await fetchText(draftUrl));
    });

  useEffect(() => {
    setText("");
    void loadDraft();
  }, [setIndex, draftUrl]);

  let parsed: ExamSet | null = null;
  let parseError: string | null = null;
  if (text.trim()) {
    try {
      parsed = parseExamSet(text);
    } catch (e) {
      parseError = (e as Error).message;
    }
  }
  // Report the parsed set whenever the text changes (parsed is derived from text).
  useEffect(() => onChange(parsed), [text]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text()
      .then(setText)
      .catch(() => setText(""));
  };

  return (
    <Section title={t("comite.setTitle")} id="set">
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <Button variant="secondary" onClick={() => void loadDraft()} busy={load.busy}>
          {t("comite.loadDraft")}
        </Button>
        <label className="btn btn-light mb-0">
          {t("comite.importFile")}
          <input type="file" accept="application/json,.json" onChange={onFile} className="visually-hidden" />
        </label>
      </div>
      {load.error ? <Notice tone="warn">{t("comite.draftMissing", { url: draftUrl })}</Notice> : null}
      <Field label={t("comite.setJson")} htmlFor="set-json">
        <textarea id="set-json" rows={10} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} className="form-control font-monospace" />
      </Field>
      {parsed ? (
        <Notice tone="ok" testId="set-valid">
          {t("comite.setValid", { label: parsed.setLabel, n: parsed.questions.length, title: parsed.examTitle })}
        </Notice>
      ) : null}
      {parseError ? (
        <Notice tone="error">
          {t("comite.setInvalid")} {parseError}
        </Notice>
      ) : null}
    </Section>
  );
}
