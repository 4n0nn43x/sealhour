"use client";
// Centre screen: key check, countdown, try before T, signature (relay or offline), open and print.
import { useEffect, useState } from "react";
import { useApp, useConfig } from "../Providers";
import { useBeacon } from "@/lib/beacon";
import { useI18n } from "@/lib/i18n";
import { setLabel } from "@/lib/registry";
import { useSnapshot } from "@/lib/useSnapshot";
import { BeaconBar, Countdown } from "../Beacon";
import { RoleSelect } from "../Shell";
import { Button, ErrorBox, Loading, Notice } from "../ui";
import { KeyCheck, useKeyCheck } from "./KeyCheck";
import { OpenPanel } from "./OpenPanel";
import { SignaturePanel } from "./SignaturePanel";
import { TryEarly } from "./TryEarly";

export function Centre() {
  const cfg = useConfig();
  const { t } = useI18n();
  const { role } = useApp();
  const b = useBeacon(cfg);
  const { snap, loading, error, reload } = useSnapshot(cfg, cfg.demo.examId);
  const [reserve, setReserve] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  const centre = role?.kind === "centre" ? role.centre : undefined;
  const onChain = snap?.centres.find((c) => centre && c.centreId.toLowerCase() === centre.centreId.toLowerCase());
  const part = snap?.participations.find((p) => centre && p.centreId.toLowerCase() === centre.centreId.toLowerCase());
  const verdict = useKeyCheck(centre ?? EMPTY_CENTRE, onChain, part);

  // A new centre or mode needs a new signature.
  useEffect(() => setSig(null), [centre?.centreId, reserve]);

  const round = snap ? (reserve ? snap.exam.reserveOpenRound : snap.exam.openRound) : 0;
  const setIndex = snap ? (reserve ? snap.exam.setCount : 0) : 0;
  // Opening is also blocked when this device's r_c does not match the centre's on chain commitment.
  const rcBlocked = verdict?.rcOk === false;
  const blocked = !verdict || !verdict.keyOk || !verdict.listed || rcBlocked;

  return (
    <>
      <div className="card">
        <div className="card-body d-flex flex-wrap align-items-center gap-3">
          <RoleSelect kinds={["centre"]} label={t("centre.choose")} />
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              id="reserve-toggle"
              checked={reserve}
              onChange={(e) => setReserve(e.target.checked)}
              data-testid="reserve-toggle"
            />
            <label className="form-check-label" htmlFor="reserve-toggle">
              {t("centre.reserveMode")}
            </label>
          </div>
          <BeaconBar b={b} />
          <Button variant="secondary" onClick={reload}>
            {t("common.reload")}
          </Button>
        </div>
      </div>
      {!centre ? <Notice tone="info">{t("centre.pickCentre")}</Notice> : null}
      {loading && !snap ? <Loading /> : null}
      <ErrorBox error={error} cfg={cfg} />
      {snap && !snap.exam.created ? <Notice tone="warn">{t("comite.examNotCreated")}</Notice> : null}
      {snap && snap.exam.created && centre ? (
        <>
          <KeyCheck v={verdict} />
          {rcBlocked ? (
            <Notice tone="error" testId="rc-blocked">
              {t("centre.rcBlocked")}
            </Notice>
          ) : null}
          <Countdown
            b={b}
            round={round}
            label={reserve ? t("centre.countdownReserve", { label: setLabel(cfg, setIndex, snap.exam.setCount) }) : t("centre.countdown")}
          />
          {b.round < round ? <TryEarly snap={snap} setIndex={setIndex} round={round} centreId={centre.centreId} identity={centre.identity} b={b} /> : null}
          <SignaturePanel key={`${centre.centreId}-${reserve}`} round={round} b={b} onSignature={setSig} />
          {sig ? <OpenPanel
              snap={snap}
              reserve={reserve}
              round={round}
              sig={sig}
              centre={centre}
              b={b}
              blocked={blocked}
              blockedReason={rcBlocked && verdict?.keyOk && verdict.listed ? t("centre.rcBlocked") : undefined}
            /> : null}
        </>
      ) : null}
    </>
  );
}

const EMPTY_CENTRE = { centreId: "", name: "", address: "", privateKey: "", identity: "", recipient: "", rcHex: "" };
