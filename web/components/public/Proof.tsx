"use client";
// Before the reveal: the countdown, the key statement (no key yet / key public with its SMS code), and the juror's
// try: take Northgate's public package and open it without the centre key (too early, then "not a centre").
import { useEffect, useState } from "react";
import { encodeSignature, generateCentreKey, openForCentre } from "@sealhour/seal";
import { useConfig } from "../Providers";
import { Countdown, TryOpen } from "../blocks";
import { fetchRoundSignature } from "@/lib/beacon";
import { errorKind, explainError, retryTransient } from "@/lib/errors";
import { useI18n } from "@/lib/i18n";
import { downloadText, fetchCentreCiphertext, type FetchedCiphertext } from "@/lib/packages";
import { setLabel, type ExamSnapshot } from "@/lib/registry";
import { useAction } from "@/lib/useAction";
import { usePhase } from "@/lib/usePhase";
import { Button, Chip, ErrorBox } from "../ui";

export function Proof({ snap }: { snap: ExamSnapshot }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const { b, milestones } = usePhase();
  const openM = milestones.find((m) => m.key === "open")!;
  const revealM = milestones.find((m) => m.key === "reveal")!;
  const reached = openM.reached;
  const target = cfg.demo.centres.find((c) => c.name === "Northgate") ?? cfg.demo.centres[0];
  const [setIndex, setSetIndex] = useState(0);
  const dl = useAction<FetchedCiphertext>();
  const sig = useAction<string>();
  const [copied, setCopied] = useState(false);

  // Once the relay serves the opening round, the signature is public: show it as the SMS code to broadcast.
  // Gated on the relay (the local clock can run ahead of it) and retried while the round is not served yet.
  const served = b.relayRound !== null && b.relayRound >= openM.round;
  useEffect(() => {
    if (!reached || !served || sig.result) return;
    let alive = true;
    void sig.run(() => retryTransient(() => fetchRoundSignature(b.client, openM.round), () => alive));
    return () => {
      alive = false;
    };
  }, [reached, served, b.client, openM.round]);

  const fetchPkg = async () => {
    const pkg = snap.packages.find((p) => p.setIndex === setIndex);
    if (!target || !pkg?.submitted) throw new Error(t("centre.noPackage"));
    return fetchCentreCiphertext(cfg, { ...pkg, examId: snap.examId }, target.centreId);
  };
  const download = () =>
    dl.run(async () => {
      const f = await fetchPkg();
      downloadText(f.file, f.ciphertext);
      return f;
    });
  // A stranger's key: before the opening it fails as too early, after it as a wrong key ("you are not a centre").
  const attempt = async () => {
    const f = dl.result ?? (await fetchPkg());
    const stranger = await generateCentreKey();
    await openForCentre({ ciphertext: f.ciphertext, identity: stranger.identity, client: b.client });
  };
  const explain = (e: unknown) => (errorKind(e) === "WrongKeyError" ? t("juror.notACentre") : explainError(e, t, cfg));
  const code = sig.result ? encodeSignature(sig.result) : null;

  return (
    <section className="card" id="proof" aria-labelledby="proof-title">
      <div className="card-header d-flex align-items-center gap-2 border-bottom border-dashed">
        <h2 className="header-title me-auto" id="proof-title">
          {reached ? t("publicPage.keyPublicTitle") : t("public.proofTitle")}
        </h2>
        <span className={`badge ${reached ? "badge-soft-success" : "badge-soft-primary"} px-2 py-1`}>{t(reached ? "phase.open" : "phase.sealing")}</span>
      </div>
      <div className="card-body">
        {reached ? (
          <Countdown label={t("publicPage.revealIn")} atMs={revealM.atMs} nowMs={b.nowMs} reached={revealM.reached} reachedLabel={t("publicPage.revealNow")} />
        ) : (
          <Countdown label={t("centre.countdown")} atMs={openM.atMs} nowMs={b.nowMs} reached={false} reachedLabel="" />
        )}
        {reached ? (
          <div className="mt-4">
            <p className="mb-2 fw-medium">{t("publicPage.smsTitle")}</p>
            <ErrorBox error={sig.error} cfg={cfg} />
            {code ? (
              <div className="d-flex flex-wrap align-items-start gap-2">
                <pre className="code sms mb-0 flex-grow-1" data-testid="base32">
                  {code}
                </pre>
                <button
                  type="button"
                  className="btn btn-soft-primary"
                  onClick={() => void navigator.clipboard?.writeText(code).then(() => setCopied(true), () => setCopied(false))}
                >
                  <i className={`ti ${copied ? "ti-check" : "ti-copy"} me-1`} aria-hidden="true" />
                  {copied ? t("publicPage.copied") : t("publicPage.copy")}
                </button>
              </div>
            ) : !sig.error ? (
              <p className="text-muted mb-0">{t("common.loading")}</p>
            ) : null}
            <p className="form-text mb-0">{t("publicPage.smsHint")}</p>
          </div>
        ) : null}
      </div>
      {target ? (
        <div className="card-body border-top border-dashed" id="juror">
          <h3 className="fs-15 fw-semibold mb-3">{t("juror.title")}</h3>
          <TryOpen
            round={openM.round}
            atMs={openM.atMs}
            reached={reached}
            buttonLabel={t("juror.tryOpen")}
            attempt={attempt}
            explain={explain}
            openedMessage={t("juror.opened")}
            testId="juror-open"
            resultTestId="juror-result"
          >
            <p className="mb-2">{t("juror.body", { name: target.name })}</p>
            <div className="d-flex flex-wrap align-items-end gap-2 mb-3">
              <div>
                <label className="form-label fs-12 text-muted mb-1" htmlFor="juror-set">
                  {t("public.set")}
                </label>
                <select
                  id="juror-set"
                  className="form-select form-select-sm"
                  value={setIndex}
                  onChange={(e) => {
                    setSetIndex(Number(e.target.value));
                    dl.reset();
                  }}
                >
                  {Array.from({ length: snap.exam.setCount }, (_, i) => (
                    <option key={i} value={i}>
                      {setLabel(cfg, i)}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" onClick={() => void download()} busy={dl.busy} testId="juror-download">
                <i className="ti ti-download me-1" aria-hidden="true" />
                {t("juror.download", { name: target.name })}
              </Button>
            </div>
            <ErrorBox error={dl.error} cfg={cfg} />
            {dl.result ? (
              <p className="text-muted">
                {t("juror.downloaded", { file: dl.result.file, n: dl.result.ciphertext.length })} <Chip ok={dl.result.leafOk && dl.result.rootOk}>{t("centre.rootOk")}</Chip>
              </p>
            ) : null}
          </TryOpen>
        </div>
      ) : null}
    </section>
  );
}
