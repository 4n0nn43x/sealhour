"use client";
// Enrolment screen (office): centres, register, freeze the list, create the exam, phantom demo.
import { useCallback, useEffect, useState } from "react";
import { useConfig } from "../Providers";
import { useBeacon } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { readAllCentres, type CentreInfo } from "@/lib/registry";
import { useSnapshot } from "@/lib/useSnapshot";
import { BeaconBar } from "../Beacon";
import { ExamPicker, useExamId } from "../ExamPicker";
import { Button, ErrorBox, Loading, Section } from "../ui";
import { CentresTable } from "./CentresTable";
import { CreateExam } from "./CreateExam";
import { FreezeList } from "./FreezeList";
import { PhantomDemo } from "./PhantomDemo";
import { RegisterCentre } from "./RegisterCentre";

export function Enrolement() {
  const cfg = useConfig();
  const { t } = useI18n();
  const b = useBeacon(cfg);
  const exam = useExamId(cfg.demo.examId);
  const { snap, loading, error, reload } = useSnapshot(cfg, exam.examId);
  const [all, setAll] = useState<CentreInfo[]>([]);
  const [allError, setAllError] = useState<unknown>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    readAllCentres(cfg)
      .then((c) => alive && (setAll(c), setAllError(undefined)))
      .catch((e: unknown) => alive && setAllError(e ?? new Error("read failed")));
    return () => {
      alive = false;
    };
  }, [cfg, tick]);

  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    reload();
  }, [reload]);

  return (
    <>
      <div className="toolbar">
        <BeaconBar b={b} />
      </div>
      <ExamPicker {...exam} title={cfg.demo.examTitle} />
      <Section title={t("enrol.centresTitle")} id="centres" aside={<Button variant="secondary" onClick={refresh}>{t("common.reload")}</Button>}>
        <ErrorBox error={allError} cfg={cfg} />
        <CentresTable centres={all} />
      </Section>
      <RegisterCentre onDone={refresh} />
      {loading && !snap ? <Loading /> : null}
      <ErrorBox error={error} cfg={cfg} />
      {snap ? (
        <>
          <FreezeList snap={snap} all={all} onDone={refresh} />
          <CreateExam snap={snap} b={b} onDone={refresh} />
          <PhantomDemo snap={snap} onDone={refresh} />
        </>
      ) : null}
    </>
  );
}
