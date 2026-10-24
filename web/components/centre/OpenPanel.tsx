"use client";
// Draw the set, fetch and check this centre's ciphertext, open it, render with the fingerprint, print.
import { useState } from "react";
import { drawSet, offlineClient, openForCentre, parseExamSet, recordCopyIndexes, renderForCentre, type Rendering } from "@sealhour/seal";
import { useConfig } from "../Providers";
import type { BeaconState } from "@/lib/beacon";
import type { DemoCentre } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import { fetchCentreCiphertext } from "@/lib/packages";
import { burnedIndexes, setLabel, submittedIndexes, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Field, Notice, Section } from "../ui";
import { Paper } from "./Paper";

interface Opened {
  setIndex: number;
  burned: number[];
  leafOk: boolean;
  rootOk: boolean;
  examTitle: string;
  subject: string;
  setLabel: string;
  rendering: Rendering;
}

export function OpenPanel({
  snap,
  reserve,
  round,
  sig,
  centre,
  b,
  blocked,
  blockedReason,
}: {
  snap: ExamSnapshot;
  reserve: boolean;
  round: number;
  sig: string;
  centre: DemoCentre;
  b: BeaconState;
  blocked: boolean;
  /** Shown instead of the key message when opening is blocked for another reason. */
  blockedReason?: string;
}) {
  const cfg = useConfig();
  const { t } = useI18n();
  const act = useAction<Opened>();
  const [copies, setCopies] = useState(60);

  const open = () =>
    act.run(async () => {
      if (!b.info) throw new Error(t("centre.noInfo"));
      const burned = burnedIndexes(snap);
      const setIndex = reserve ? snap.exam.setCount : drawSet(sig, snap.exam.setCount, burned, submittedIndexes(snap));
      const pkg = snap.packages.find((p) => p.setIndex === setIndex);
      if (!pkg?.submitted) throw new Error(t("centre.noPackage"));
      const f = await fetchCentreCiphertext(cfg, pkg.uri, centre.centreId, pkg.root);
      if (!f.leafOk || !f.rootOk) throw new Error(t("centre.integrityFail"));
      const client = offlineClient(b.info, round, sig);
      const bytes = await openForCentre({ ciphertext: f.ciphertext, identity: centre.identity, client });
      const set = parseExamSet(new TextDecoder().decode(bytes));
      const rendering = renderForCentre(set, centre.centreId, centre.rcHex, sig);
      return { setIndex, burned, leafOk: f.leafOk, rootOk: f.rootOk, examTitle: set.examTitle, subject: set.subject, setLabel: set.setLabel, rendering };
    });

  const r = act.result;
  let record: number[] = [];
  try {
    record = copies > 0 ? recordCopyIndexes(sig, copies) : [];
  } catch {
    record = [];
  }

  return (
    <Section title={t("centre.openTitle")} id="open">
      <p>{reserve ? t("centre.openReserveBody") : t("centre.openBody")}</p>
      <Button onClick={() => void open()} busy={act.busy} disabled={blocked} testId="open">
        {t("centre.open")}
      </Button>
      {blocked ? <p className="hint">{blockedReason ?? t("centre.blocked")}</p> : null}
      <ErrorBox error={act.error} cfg={cfg} />
      {r ? (
        <div className="stack" data-testid="opened">
          <Notice tone="ok">
            {reserve
              ? t("centre.reserveSet", { label: setLabel(cfg, r.setIndex, snap.exam.setCount) })
              : t("centre.drawn", {
                  label: setLabel(cfg, r.setIndex, snap.exam.setCount),
                  burned: r.burned.length ? r.burned.map((i) => setLabel(cfg, i)).join(", ") : t("common.none"),
                })}
          </Notice>
          <p>
            <Chip ok={r.leafOk}>{t("centre.leafOk")}</Chip> <Chip ok={r.rootOk}>{t("centre.rootOk")}</Chip>
          </p>
          <div className="grid-2">
            <Field label={t("centre.copies")} htmlFor="copies" hint={t("centre.copiesHint")}>
              <input id="copies" type="number" min={1} value={copies} onChange={(e) => setCopies(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
            </Field>
            <div className="record" data-testid="record-copies">
              <strong>{t("centre.recordCopies")}</strong>
              <p className="big">{record.join(", ")}</p>
            </div>
          </div>
          <Paper
            examTitle={r.examTitle}
            subject={r.subject}
            setLabel={r.setLabel}
            centreName={centre.name}
            round={round}
            sig={sig}
            rendering={r.rendering}
          />
        </div>
      ) : null}
    </Section>
  );
}
