"use client";
// Office form: create the exam on the frozen list, rounds prefilled from the beacon (now + N minutes).
import { useState } from "react";
import { isAddress } from "ethers";
import { useConfig } from "../Providers";
import { useActor } from "@/lib/actor";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import { registry, sendTx, type TxResult } from "@/lib/chain";
import { formatTime, useI18n } from "@/lib/i18n";
import { splitList } from "@/lib/ids";
import type { ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Field, Notice, Section, TxOutcome } from "../ui";

interface Minutes {
  open: number;
  reveal: number;
  reserveOpen: number;
  reserveReveal: number;
}

export function computeRounds(current: number, period: number, m: Minutes) {
  const r = (min: number) => Math.max(1, Math.ceil((min * 60) / period));
  const open = current + r(m.open);
  const reveal = open + r(m.reveal);
  const reserveOpen = reveal + r(m.reserveOpen);
  const reserveReveal = reserveOpen + r(m.reserveReveal);
  return { open, reveal, reserveOpen, reserveReveal };
}

export function CreateExam({ snap, b, onDone }: { snap: ExamSnapshot; b: BeaconState; onDone: () => void }) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { wallet } = useActor();
  const tx = useAction<TxResult>();
  const [m, setM] = useState<Minutes>({ open: 2, reveal: 3, reserveOpen: 2, reserveReveal: 2 });
  const [committees, setCommittees] = useState(cfg.demo.committees.map((c) => c.address).join("\n"));
  const [reserve, setReserve] = useState(cfg.demo.reserveCommittee.address);
  const rounds = computeRounds(b.round, b.period, m);
  const list = splitList(committees);
  const addrOk = list.length >= 2 && list.length <= 8 && list.every((a) => isAddress(a)) && isAddress(reserve);
  const created = snap.exam.created;

  const create = () =>
    tx.run(async () => {
      if (!wallet) throw new Error(t("common.needWallet"));
      const fresh = computeRounds(b.round, b.period, m);
      const r = await sendTx(registry(cfg, wallet), "createExam", [
        snap.examId,
        fresh.open,
        fresh.reveal,
        fresh.reserveOpen,
        fresh.reserveReveal,
        list,
        reserve,
      ]);
      onDone();
      return r;
    });

  const minuteField = (k: keyof Minutes, label: string) => (
    <Field label={label} htmlFor={`m-${k}`}>
      <input
        id={`m-${k}`}
        className="form-control"
        type="number"
        min={1}
        step={1}
        value={m[k]}
        onChange={(e) => setM({ ...m, [k]: Math.max(1, Number(e.target.value) || 1) })}
      />
    </Field>
  );

  return (
    <Section title={t("enrol.createTitle")} id="create" aside={<Chip ok={created}>{created ? t("enrol.examCreated") : t("enrol.examNotCreated")}</Chip>}>
      {created ? (
        <dl className="kv">
          <dt>{t("rounds.open")}</dt>
          <dd>
            {snap.exam.openRound} ({formatTime(roundTimeMs(cfg, b.info, snap.exam.openRound), locale)})
          </dd>
          <dt>{t("rounds.reveal")}</dt>
          <dd>
            {snap.exam.revealRound} ({formatTime(roundTimeMs(cfg, b.info, snap.exam.revealRound), locale)})
          </dd>
          <dt>{t("rounds.reserveOpen")}</dt>
          <dd>{snap.exam.reserveOpenRound}</dd>
          <dt>{t("rounds.reserveReveal")}</dt>
          <dd>{snap.exam.reserveRevealRound}</dd>
          <dt>{t("enrol.setCount")}</dt>
          <dd>{snap.exam.setCount}</dd>
        </dl>
      ) : (
        <>
          {!snap.exam.frozen ? <Notice tone="warn">{t("enrol.freezeFirst")}</Notice> : null}
          <div className="row row-cols-1 row-cols-sm-2 row-cols-lg-4">
            {minuteField("open", t("enrol.openIn"))}
            {minuteField("reveal", t("enrol.revealAfter"))}
            {minuteField("reserveOpen", t("enrol.reserveOpenAfter"))}
            {minuteField("reserveReveal", t("enrol.reserveRevealAfter"))}
          </div>
          <p className="text-muted" data-testid="rounds-preview">
            {t("enrol.roundsPreview", {
              open: rounds.open,
              reveal: rounds.reveal,
              ro: rounds.reserveOpen,
              rr: rounds.reserveReveal,
              at: formatTime(roundTimeMs(cfg, b.info, rounds.open), locale),
            })}
          </p>
          <Field label={t("enrol.committees")} htmlFor="committees" hint={t("enrol.committeesHint")}>
            <textarea id="committees" className="form-control" rows={4} value={committees} onChange={(e) => setCommittees(e.target.value)} />
          </Field>
          <Field label={t("enrol.reserveCommittee")} htmlFor="reserve">
            <input id="reserve" className="form-control" value={reserve} onChange={(e) => setReserve(e.target.value)} />
          </Field>
          {!addrOk ? <Notice tone="warn">{t("enrol.badCommittees")}</Notice> : null}
        </>
      )}
      <Button onClick={() => void create()} busy={tx.busy} disabled={created || !addrOk} testId="create-exam">
        {t("enrol.create")}
      </Button>
      <ErrorBox error={tx.error} cfg={cfg} />
      <TxOutcome tx={tx.result} />
    </Section>
  );
}
