"use client";
// Committee screen: frozen list check, set, sealing in the browser, publication, burn.
import { useState } from "react";
import type { ExamSet } from "@sealhour/seal";
import { useApp, useConfig } from "../Providers";
import { useBeacon } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { setLabel } from "@/lib/registry";
import { useSnapshot } from "@/lib/useSnapshot";
import { BeaconBar } from "../Beacon";
import { ExamPicker, useExamId } from "../ExamPicker";
import { RoleSelect } from "../Shell";
import { Button, ErrorBox, Hex, Loading, Notice } from "../ui";
import { BurnPanel } from "./BurnPanel";
import { checkList, ListCheck } from "./ListCheck";
import { SealPanel } from "./SealPanel";
import { SetEditor } from "./SetEditor";

export function Comite() {
  const cfg = useConfig();
  const { t } = useI18n();
  const { role } = useApp();
  const b = useBeacon(cfg);
  const exam = useExamId(cfg.demo.examId);
  const { snap, loading, error, reload } = useSnapshot(cfg, exam.examId);
  const [set, setSet] = useState<ExamSet | null>(null);

  const committee = role?.kind === "committee" ? role.committee : undefined;
  const isReserve = committee !== undefined && committee.address.toLowerCase() === cfg.demo.reserveCommittee.address.toLowerCase();
  const setIndex = committee ? (isReserve && snap?.exam.created ? snap.exam.setCount : committee.setIndex) : -1;
  const onChainCommittee = snap?.packages.find((p) => p.setIndex === setIndex)?.committee;

  return (
    <>
      <div className="toolbar">
        <RoleSelect kinds={["committee"]} label={t("comite.choose")} />
        <BeaconBar b={b} />
        <Button variant="secondary" onClick={reload}>
          {t("common.reload")}
        </Button>
      </div>
      <ExamPicker {...exam} title={cfg.demo.examTitle} />
      {!committee ? <Notice tone="info">{t("comite.pickCommittee")}</Notice> : null}
      {loading && !snap ? <Loading /> : null}
      <ErrorBox error={error} cfg={cfg} />
      {snap && committee ? (
        <>
          <p className="muted">
            {t("comite.acting", { label: setLabel(cfg, setIndex, snap.exam.setCount) })} <Hex value={committee.address} />{" "}
            {onChainCommittee && onChainCommittee.toLowerCase() !== committee.address.toLowerCase() ? (
              <strong className="bad">{t("comite.notThisCommittee")}</strong>
            ) : null}
          </p>
          {!snap.exam.created ? <Notice tone="warn">{t("comite.examNotCreated")}</Notice> : null}
          <ListCheckAndSeal snap={snap} setIndex={setIndex} set={set} setSet={setSet} b={b} reload={reload} />
        </>
      ) : null}
    </>
  );
}

function ListCheckAndSeal({
  snap,
  setIndex,
  set,
  setSet,
  b,
  reload,
}: {
  snap: NonNullable<ReturnType<typeof useSnapshot>["snap"]>;
  setIndex: number;
  set: ExamSet | null;
  setSet: (s: ExamSet | null) => void;
  b: ReturnType<typeof useBeacon>;
  reload: () => void;
}) {
  const cfg = useConfig();
  const { t } = useI18n();
  const verdict = checkList(snap, cfg.demo.announcedCentreCount, t);
  const canSeal = verdict.ok && snap.exam.created;
  const refusal = !verdict.ok ? verdict.reason : !snap.exam.created ? t("comite.examNotCreated") : undefined;
  return (
    <>
      <ListCheck snap={snap} verdict={verdict} />
      <SetEditor setIndex={setIndex} onChange={setSet} />
      <SealPanel
        snap={snap}
        setIndex={setIndex}
        label={setLabel(cfg, setIndex, snap.exam.setCount)}
        set={set}
        canSeal={canSeal}
        refusal={refusal}
        b={b}
        onDone={reload}
      />
      {snap.exam.created ? <BurnPanel snap={snap} setIndex={setIndex} b={b} onDone={reload} /> : null}
    </>
  );
}
