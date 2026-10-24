"use client";
// Dated leak verifier: who does a circulating text point to? Committee (before T), centre (fingerprint), or nobody.
// The verdict itself shows in FlagPanel, next to the flag it justifies.
import { useState } from "react";
import { attributeLeak, renderForCentre, renderPlain, type LeakVerdict } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import type { DictKey } from "@/lib/dict";
import { useI18n } from "@/lib/i18n";
import { centreName, setLabel, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, ErrorBox, Field, Notice } from "../ui";
import type { RevealData } from "./RevealPanel";

/** datetime-local value (local time, minutes) for a timestamp. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function Verifier({ snap, b, data, onLeak }: { snap: ExamSnapshot; b: BeaconState; data: RevealData | null; onLeak: (text: string, verdict: LeakVerdict | null) => void }) {
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
    <section className="card" id="verifier" aria-labelledby="verifier-title">
      <div className="card-header border-bottom border-dashed">
        <h2 className="header-title" id="verifier-title">
          {t("verifier.title")}
        </h2>
        <p className="text-muted mb-0 mt-1">{t("verifier.body")}</p>
      </div>
      <div className="card-body">
        {presets.length ? (
          <div className="d-flex flex-wrap align-items-center gap-2 mb-3" role="group" aria-label={t("verifier.presets")}>
            <span className="text-muted me-1">{t("verifier.presets")}:</span>
            {presets.map((p) => (
              <button
                key={p.key}
                type="button"
                className="btn btn-soft-primary btn-sm rounded-pill"
                data-testid={`preset-${p.key}`}
                onClick={() => {
                  setText(p.text);
                  setSeenAt(toLocalInput(p.at));
                  act.reset();
                  onLeak(p.text, null);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}
        <Field label={t("verifier.text")} htmlFor="leak">
          <textarea id="leak" className="form-control" rows={6} value={text} onChange={(e) => (setText(e.target.value), onLeak(e.target.value, null))} />
        </Field>
        <Field label={t("verifier.seenAt")} htmlFor="seen-at" hint={t("verifier.seenHint")}>
          <input id="seen-at" className="form-control w-auto" type="datetime-local" step={1} value={seenAt} onChange={(e) => (setSeenAt(e.target.value), onLeak(text, null))} />
        </Field>
        <Button onClick={() => void run()} busy={act.busy} disabled={!data || !text.trim()} testId="verify">
          <i className="ti ti-search me-1" aria-hidden="true" />
          {t("verifier.run")}
        </Button>
        {!data ? <p className="form-text mb-0">{t("verifier.needReveal")}</p> : !text.trim() ? <p className="form-text mb-0">{t("publicPage.verifyHint")}</p> : null}
        <div className="mt-3">
          <ErrorBox error={act.error} cfg={cfg} />
        </div>
      </div>
    </section>
  );
}

/** The verdict in plain words (testid verdict). */
export function VerdictView({ v, snap }: { v: LeakVerdict; snap: ExamSnapshot }) {
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
      <strong>{t(`verifier.v.${v.verdict}` as DictKey)}</strong> {msg}
    </Notice>
  );
}
