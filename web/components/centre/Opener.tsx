"use client";
// Open the paper in one action: get the opening signature (from the relay, or the SMS code typed in), check it,
// draw the set, fetch and check this centre's file, open it. Then OpenedView: drawn set, record copies, paper.
import { useId, useState } from "react";
import { decodeSignature, drawSet, encodeSignature, offlineClient, openForCentre, parseExamSet, recordCopyIndexes, renderForCentre, type Rendering } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { DrawResult, VerifyDetails } from "../blocks";
import { fetchRoundSignature, type BeaconState } from "@/lib/beacon";
import type { DemoCentre } from "@/lib/config";
import { hm, useI18n } from "@/lib/i18n";
import { fetchCentreCiphertext } from "@/lib/packages";
import { burnedIndexes, readSnapshot, submittedIndexes, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { Button, Chip, ErrorBox, Field, Hex } from "../ui";
import { Paper } from "./Paper";

export interface Opened {
  setIndex: number;
  burned: number[];
  leafOk: boolean;
  rootOk: boolean;
  examTitle: string;
  subject: string;
  setLabel: string;
  rendering: Rendering;
  sig: string;
  via: "relay" | "sms";
  round: number;
  reserve: boolean;
}

export function OpenControls(props: {
  snap: ExamSnapshot;
  b: BeaconState;
  round: number;
  reserve: boolean;
  centre: DemoCentre;
  opensAt: number;
  /** Set when this device may not open (wrong key, r_c mismatch). */
  blockedReason?: string;
  onOpened: (o: Opened) => void;
}) {
  const { b, round, reserve, centre, opensAt, blockedReason, onOpened } = props;
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const act = useAction<Opened>();
  const [via, setVia] = useState<"relay" | "sms">("relay");
  const [sms, setSms] = useState(false);
  const [pasted, setPasted] = useState("");
  // The verified signature of the last try, kept even if the package fetch then fails (its SMS code still helps).
  const [goodSig, setGoodSig] = useState<string | null>(null);
  const smsId = useId();
  const reached = b.round >= round;
  const disabled = !reached || Boolean(blockedReason);
  const reason = blockedReason ?? (!reached ? t("tx.opensAt", { time: hm(opensAt, locale) }) : null);

  const open = (how: "relay" | "sms", getSig: () => Promise<string>) => {
    setVia(how);
    setGoodSig(null);
    return act.run(async () => {
      if (!b.info) throw new Error(t("centre.noInfo"));
      const sig = await getSig();
      // offlineClient throws BadSignatureError when the signature does not verify for this round.
      const client = offlineClient(b.info, round, sig);
      setGoodSig(sig);
      // Fresh snapshot: a set burned after the page was opened must be skipped by the draw.
      const snap = await readSnapshot(cfg, props.snap.examId);
      const burned = burnedIndexes(snap);
      const setIndex = reserve ? snap.exam.setCount : drawSet(sig, snap.exam.setCount, burned, submittedIndexes(snap));
      const pkg = snap.packages.find((p) => p.setIndex === setIndex);
      if (!pkg?.submitted) throw new Error(t("centre.noPackage"));
      const f = await fetchCentreCiphertext(cfg, pkg.uri, centre.centreId, pkg.root);
      if (!f.leafOk || !f.rootOk) throw new Error(t("centre.integrityFail"));
      const bytes = await openForCentre({ ciphertext: f.ciphertext, identity: centre.identity, client });
      const set = parseExamSet(new TextDecoder().decode(bytes));
      const rendering = renderForCentre(set, centre.centreId, centre.rcHex, sig);
      const o: Opened = { setIndex, burned, leafOk: f.leafOk, rootOk: f.rootOk, examTitle: set.examTitle, subject: set.subject, setLabel: set.setLabel, rendering, sig, via: how, round, reserve };
      onOpened(o);
      return o;
    });
  };

  const fromRelay = () => open("relay", () => fetchRoundSignature(b.client, round));
  const fromSms = () =>
    open("sms", async () => {
      try {
        return decodeSignature(pasted);
      } catch {
        throw new Error("BadBase32");
      }
    });

  return (
    <>
      <p className="mb-3">{reserve ? t("centrePage.openReserveBody") : t("centrePage.openBody")}</p>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <Button onClick={() => void fromRelay()} busy={act.busy && via === "relay"} disabled={disabled || act.busy} testId="fetch-signature">
          <i className="ti ti-lock-open me-1" aria-hidden="true" />
          {t("centrePage.openButton")}
        </Button>
        <button type="button" className="btn btn-link text-decoration-none text-start px-0 px-sm-2" aria-expanded={sms} aria-controls={smsId} onClick={() => setSms(!sms)} data-testid="sms-toggle">
          <i className="ti ti-message-2 me-1" aria-hidden="true" />
          {t("centrePage.smsToggle")}
        </button>
      </div>
      {disabled && reason ? <p className="form-text mb-0">{reason}</p> : null}
      <div id={smsId} hidden={!sms} className="mt-3 p-3 rounded bg-light bg-opacity-50">
        <Field label={t("centrePage.smsLabel")} htmlFor="sig-b32" hint={t("centrePage.smsHint")}>
          <textarea id="sig-b32" rows={3} value={pasted} onChange={(e) => setPasted(e.target.value)} className="form-control font-monospace" spellCheck={false} autoComplete="off" />
        </Field>
        {/* Pasting works at any time: the signature is checked cryptographically, not against the local clock. */}
        <Button onClick={() => void fromSms()} busy={act.busy && via === "sms"} disabled={Boolean(blockedReason) || act.busy || !pasted.trim()} testId="paste-signature">
          {t("centrePage.smsButton")}
        </Button>
        {b.infoSource === "cache" ? <p className="form-text mb-0">{t("centre.cachedInfo")}</p> : null}
      </div>
      <div className="mt-3">
        <ErrorBox error={act.error} cfg={cfg} />
        {act.error && goodSig ? (
          <>
            <p className="mb-1">{t("centre.sms")}</p>
            <pre className="code sms mb-0">{encodeSignature(goodSig)}</pre>
          </>
        ) : null}
      </div>
    </>
  );
}

/** The opened paper: drawn set, signature checked, record copies, print, paper; technical checks in details. */
export function OpenedView({ o, centre, setCount }: { o: Opened; centre: DemoCentre; setCount: number }) {
  const { t } = useI18n();
  const [copies, setCopies] = useState(60);
  let record: number[] = [];
  try {
    record = copies > 0 ? recordCopyIndexes(o.sig, copies) : [];
  } catch {
    record = [];
  }
  return (
    <div className="vstack gap-3" data-testid="opened">
      <DrawResult drawnSet={o.setIndex} burned={o.burned} setCount={setCount} reserve={o.reserve} />
      <p className="mb-0" data-testid="signature-ok">
        <i className="ti ti-circle-check-filled text-success me-1" aria-hidden="true" />
        {o.via === "sms" ? t("centrePage.sigOkSms") : t("centrePage.sigOkRelay")}
      </p>
      <div className="row g-3 align-items-start">
        <div className="col-sm-4">
          <Field label={t("centre.copies")} htmlFor="copies" hint={t("centre.copiesHint")}>
            <input id="copies" className="form-control" type="number" min={1} value={copies} onChange={(e) => setCopies(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          </Field>
        </div>
        <div className="col-sm-8" data-testid="record-copies">
          <p className="form-label mb-1">{t("centre.recordCopies")}</p>
          <p className="big fs-3 fw-bold tabular mb-0 text-primary">{record.join(", ")}</p>
        </div>
      </div>
      <Paper examTitle={o.examTitle} subject={o.subject} setLabel={o.setLabel} centreName={centre.name} round={o.round} sig={o.sig} rendering={o.rendering} />
      <VerifyDetails testId="opened-details">
        <p className="d-flex flex-wrap gap-2 mb-2">
          <Chip ok={o.leafOk}>{t("centre.leafOk")}</Chip> <Chip ok={o.rootOk}>{t("centre.rootOk")}</Chip>
        </p>
        <p className="mb-2">
          {t("centre.fingerprint")} <code>{o.rendering.marks}</code>
        </p>
        <p className="mb-2">
          {t("centrePage.sigHex", { round: o.round })} <Hex value={o.sig} head={10} tail={8} />
        </p>
        <p className="mb-1">{t("centre.sms")}</p>
        <pre className="code sms mb-0" data-testid="base32">
          {encodeSignature(o.sig)}
        </pre>
      </VerifyDetails>
    </div>
  );
}
