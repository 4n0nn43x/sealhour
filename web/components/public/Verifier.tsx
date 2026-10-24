"use client";
// Dated leak verifier: who does a circulating text point to? Committee (before T), centre (fingerprint), or nobody.
import { useState } from "react";
import { attributeLeak, renderForCentre, renderPlain, type LeakVerdict } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { centreName, setLabel, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Field, Notice, Section } from "../ui";
import type { RevealData } from "./RevealPanel";

/** datetime-local value (local time, minutes) for a timestamp. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function Verifier({ snap, b, data, onLeak }: { snap: ExamSnapshot; b: BeaconState; data: RevealData | null; onLeak: (text: string, verdict: LeakVerdict) => void }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const T = roundTimeMs(cfg, b.info, snap.exam.openRound);
  const revealT = roundTimeMs(cfg, b.info, snap.exam.revealRound);
  // A centre window date: after T, before the reveal round (after it anyone can compute renderings).
  const inCentreWindow = T + Math.floor((revealT - T) / 2);
  const [text, setText] = useState("");
  const [seenAt, setSeenAt] = useState(toLocalInput(inCentreWindow));
  const act = useAction<LeakVerdict>();

  const centresWithRc = (data?.centres ?? []).filter((c) => c.rcHex).map((c) => ({ centreId: c.centreId, rcHex: c.rcHex! }));
  const drawn = data?.sets.find((s) => s.setIndex === data.drawnSet)?.set;

  const presets = data && drawn
    ? (() => {
        const riverside = centresWithRc.find((c) => centreName(cfg, snap, c.centreId) === "Riverside") ?? centresWithRc[1] ?? centresWithRc[0];
        const early = data.sets.find((s) => data.burned.includes(s.setIndex)) ?? data.sets.find((s) => s.setIndex !== data.drawnSet) ?? data.sets[0];
        const list: { key: string; label: string; text: string; at: number }[] = [];
        if (riverside) {
          list.push({
            key: "photo",
            label: t("verifier.presetPhoto", { name: centreName(cfg, snap, riverside.centreId) }),
            text: renderForCentre(drawn, riverside.centreId, riverside.rcHex, data.signatureHex).text,
            at: inCentreWindow,
          });
        }
        if (early) list.push({ key: "before", label: t("verifier.presetBefore", { label: setLabel(cfg, early.setIndex) }), text: renderPlain(early.set), at: T - 24 * 3_600_000 });
        list.push({ key: "retyped", label: t("verifier.presetRetyped"), text: renderPlain(drawn), at: inCentreWindow });
        return list;
      })()
    : [];

  const run = () =>
    act.run(async () => {
      if (!data) throw new Error(t("verifier.needReveal"));
      const seenAtMs = new Date(seenAt).getTime();
      if (!Number.isFinite(seenAtMs)) throw new Error(t("verifier.badDate"));
      const v = attributeLeak({
        leakedText: text,
        seenAtMs,
        openRoundTimeMs: T,
        revealRoundTimeMs: revealT,
        sets: data.sets,
        drawnSet: data.drawnSet,
        signatureHex: data.signatureHex,
        centres: centresWithRc,
      });
      onLeak(text, v);
      return v;
    });

  return (
    <Section title={t("verifier.title")} id="verifier">
      <p>{t("verifier.body")}</p>
      {!data ? <Notice tone="info">{t("verifier.needReveal")}</Notice> : null}
      {presets.length ? (
        <div className="d-flex flex-wrap align-items-center gap-2 mb-3" role="group" aria-label={t("verifier.presets")}>
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              className="btn btn-light btn-sm"
              data-testid={`preset-${p.key}`}
              onClick={() => {
                setText(p.text);
                setSeenAt(toLocalInput(p.at));
                act.reset();
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      <Field label={t("verifier.text")} htmlFor="leak">
        <textarea id="leak" className="form-control" rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label={t("verifier.seenAt")} htmlFor="seen-at" hint={t("verifier.seenHint")}>
        <input id="seen-at" className="form-control w-auto" type="datetime-local" step={1} value={seenAt} onChange={(e) => setSeenAt(e.target.value)} />
      </Field>
      <Button onClick={() => void run()} busy={act.busy} disabled={!data || !text.trim()} testId="verify">
        {t("verifier.run")}
      </Button>
      <ErrorBox error={act.error} cfg={cfg} />
      {act.result ? <VerdictView v={act.result} snap={snap} /> : null}
    </Section>
  );
}

function VerdictView({ v, snap }: { v: LeakVerdict; snap: ExamSnapshot }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const score = v.score.toFixed(2);
  let msg: string;
  switch (v.verdict) {
    case "committee":
      msg = t("verifier.committee", { label: setLabel(cfg, v.setIndex ?? 0, snap.exam.setCount), score });
      break;
    case "centre":
      msg = t("verifier.centre", { name: centreName(cfg, snap, v.centreId ?? ""), label: setLabel(cfg, v.setIndex ?? 0), score });
      break;
    case "unattributed":
      msg = t("verifier.unattributed", { score });
      break;
    default:
      msg = t("verifier.noMatch", { score });
  }
  return (
    <Notice tone={v.verdict === "no-match" ? "info" : "warn"} testId="verdict">
      <strong>{t(`verifier.v.${v.verdict}`)}</strong> {msg}
    </Notice>
  );
}
