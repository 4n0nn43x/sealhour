"use client";
// What the committee browser checks before sealing: the frozen list, read from chain, against the announced count.
import { useConfig } from "../Providers";
import { useI18n } from "@/lib/i18n";
import type { ExamSnapshot } from "@/lib/registry";
import { CentresTable } from "../enrolement/CentresTable";
import { Chip, Hex, Notice, Section } from "../ui";

export type ListVerdict = { ok: true } | { ok: false; reason: string };

export function checkList(snap: ExamSnapshot, announced: number, t: ReturnType<typeof useI18n>["t"]): ListVerdict {
  if (!snap.exam.frozen) return { ok: false, reason: t("comite.notFrozen") };
  if (snap.exam.centreCount !== announced || snap.centres.length !== announced) {
    return { ok: false, reason: t("comite.countMismatch", { chain: snap.exam.centreCount, announced }) };
  }
  if (snap.centres.some((c) => !c.recipient)) return { ok: false, reason: t("comite.missingKey") };
  return { ok: true };
}

export function ListCheck({ snap, verdict }: { snap: ExamSnapshot; verdict: ListVerdict }) {
  const cfg = useConfig();
  const { t } = useI18n();
  return (
    <Section title={t("comite.listTitle")} id="list" aside={<Chip ok={verdict.ok}>{verdict.ok ? t("comite.listOk") : t("comite.listRefused")}</Chip>}>
      <dl className="kv">
        <dt>{t("enrol.announced")}</dt>
        <dd data-testid="announced-count">{cfg.demo.announcedCentreCount}</dd>
        <dt>{t("enrol.onChainCount")}</dt>
        <dd data-testid="chain-count">{snap.exam.frozen ? snap.exam.centreCount : "-"}</dd>
        <dt>{t("enrol.listRoot")}</dt>
        <dd>
          <Hex value={snap.exam.frozen ? snap.exam.listRoot : null} head={10} tail={8} />
        </dd>
      </dl>
      <CentresTable centres={snap.centres} />
      {!verdict.ok ? (
        <Notice tone="error" testId="seal-refused">
          {verdict.reason}
        </Notice>
      ) : null}
    </Section>
  );
}
