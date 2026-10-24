"use client";
// Centre page, driven by the exam phase: 1 which centre / device ready, 2 opening time (try to open before it),
// 3 open the paper (relay or SMS code, one action), 4 print; 5 the reserve set, only after its opening time.
import { useEffect, useState } from "react";
import { openForCentre } from "@sealhour/seal";
import { useApp, useConfig } from "../Providers";
import { Countdown, EmptyState, ExamTimeline, Step, StepList, TryOpen, VerifyDetails } from "../blocks";
import { RolePicker } from "../Header";
import { hm, useI18n } from "@/lib/i18n";
import { fetchCentreCiphertext } from "@/lib/packages";
import { setLabel } from "@/lib/registry";
import { usePhase } from "@/lib/usePhase";
import { Chip, ErrorBox, Loading, Notice } from "../ui";
import { KeyChecks, useKeyCheck } from "./KeyCheck";
import { CentreKeyStep, JoinStep } from "./LiveCentre";
import { OpenControls, OpenedView, type Opened } from "./Opener";

const EMPTY_CENTRE = { centreId: "", name: "", address: "", privateKey: "", identity: "", recipient: "", rcHex: "" };

export function Centre() {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const { role } = useApp();
  const { snap, b, milestones, loading, error, reload } = usePhase();
  const [reserve, setReserve] = useState(false);
  const [opened, setOpened] = useState<Opened | null>(null);
  const centre = role?.kind === "centre" ? role.centre : undefined;
  const same = (id: string) => Boolean(centre) && id.toLowerCase() === centre!.centreId.toLowerCase();
  const verdict = useKeyCheck(centre ?? EMPTY_CENTRE, snap?.centres.find((c) => same(c.centreId)), snap?.participations.find((p) => same(p.centreId)));

  // Another centre, or the switch to the reserve, needs a new signature and a new opening.
  useEffect(() => setOpened(null), [centre?.centreId, reserve]);

  if (!snap) return loading ? <Loading /> : <ErrorBox error={error} cfg={cfg} />;
  const e = snap.exam;
  const openM = milestones.find((m) => m.key === "open");
  const reserveM = milestones.find((m) => m.key === "reserveOpen");
  const reserveLabel = setLabel(cfg, e.setCount, e.setCount);

  // Device check: blocked when the key is not the registered one, or the local r_c differs from the commitment.
  const keyBad = verdict !== null && (!verdict.keyOk || !verdict.listed);
  const rcBad = verdict?.rcOk === false;
  const ready = verdict !== null && !keyBad && !rcBad;
  const blockedReason = !centre || verdict === null ? t("common.loading") : keyBad ? t("centre.blocked") : rcBad ? t("centre.rcBlocked") : undefined;

  const picker = (
    <Step key="pick" id="pick" title={t("actor.pickCentre")} state="current">
      <p className="mb-3">{t(cfg.mode === "live" ? "live.pickCentre" : "centrePage.pickBody")}</p>
      <div style={{ maxWidth: 320 }}>
        <RolePicker kinds={["centre"]} label={t("centre.choose")} />
      </div>
    </Step>
  );

  const device = centre ? (
    <Step
      key="key"
      id="key"
      title={t("centrePage.deviceTitle")}
      state={ready ? "done" : "current"}
      summary={
        <>
          <Chip ok>{t("centre.keyOk")}</Chip> {t("centrePage.deviceOk", { name: centre.name })}
        </>
      }
      aside={
        <div className="d-none d-sm-block" style={{ width: 230 }}>
          <RolePicker kinds={["centre"]} label={t("centre.choose")} />
        </div>
      }
    >
      {verdict === null ? <Loading /> : null}
      {ready ? <p className="mb-0">{t("centrePage.deviceOk", { name: centre.name })}</p> : null}
      {keyBad ? (
        <Notice tone="error" testId="key-blocked">
          {t("centre.blocked")}
        </Notice>
      ) : null}
      {rcBad && !keyBad ? (
        <Notice tone="error" testId="rc-blocked">
          {t("centre.rcBlocked")}
        </Notice>
      ) : null}
      {verdict ? (
        <VerifyDetails>
          <KeyChecks v={verdict} />
        </VerifyDetails>
      ) : null}
    </Step>
  ) : null;

  // Before the opening: the centre itself cannot open (no key exists). Any published package will do.
  const tryEarly = async () => {
    if (!centre) throw new Error(t("centre.pickCentre"));
    const pkg = snap.packages.find((p) => p.setIndex === 0 && p.submitted) ?? snap.packages.find((p) => p.submitted);
    if (!pkg) throw new Error(t("centre.noPackage"));
    const f = await fetchCentreCiphertext(cfg, { ...pkg, examId: snap.examId }, centre.centreId);
    await openForCentre({ ciphertext: f.ciphertext, identity: centre.identity, client: b.client });
  };

  const controls = (isReserve: boolean, round: number, at: number) =>
    centre ? (
      <OpenControls key={`${centre.centreId}-${isReserve}`} snap={snap} b={b} round={round} reserve={isReserve} centre={centre} opensAt={at} blockedReason={blockedReason} onOpened={setOpened} />
    ) : null;
  const openedView = opened && centre ? <OpenedView o={opened} centre={centre} setCount={e.setCount} /> : null;
  const openedSummary = opened ? t(opened.via === "sms" ? "centrePage.openedSms" : "centrePage.openedRelay", { label: setLabel(cfg, opened.setIndex, e.setCount) }) : undefined;

  return (
    <div className="row">
      <div className="col-xl-8">
        <StepList>
          {!centre ? (
            picker
          ) : cfg.mode === "live" ? (
            // Live: the centre publishes its key and joins itself; the device check follows once it is listed.
            <>
              <CentreKeyStep key={`key-${centre.centreId}`} centre={centre} />
              <JoinStep key={`join-${centre.centreId}`} centre={centre} snap={snap} b={b} onDone={reload} />
              {snap.centres.some((c) => same(c.centreId)) ? device : null}
            </>
          ) : (
            device
          )}
          {!e.created || !openM ? (
            <Step title={t("centrePage.whenTitle")} state="future" summary={t("comite.examNotCreated")}>
              <EmptyState icon="hourglass-bold-duotone" title={t("comite.examNotCreated")} body={t("frozen.emptyBody")} />
            </Step>
          ) : (
            <>
              <Step id="countdown" title={t("centrePage.whenTitle")} state={openM.reached ? "done" : "current"} summary={t("tryopen.keyPublic", { time: hm(openM.atMs, locale) })}>
                <Countdown label={t("centre.countdown")} atMs={openM.atMs} nowMs={b.nowMs} reached={openM.reached} reachedLabel={t("centrePage.nowOpen")} />
                {!openM.reached && centre ? (
                  <div className="border-top border-dashed pt-3 mt-3">
                    <TryOpen round={openM.round} atMs={openM.atMs} reached={false} buttonLabel={t("centre.tryNow")} attempt={tryEarly} openedMessage={t("centre.openedEarly")} />
                  </div>
                ) : null}
              </Step>
              <Step
                id="signature"
                title={t("centrePage.openTitle")}
                state={!centre ? "future" : reserve || opened ? "done" : openM.reached ? "current" : "future"}
                opensAt={openM.reached ? undefined : openM.atMs}
                summary={reserve ? t("centrePage.switchedReserve", { label: reserveLabel }) : openedSummary}
              >
                {reserve ? undefined : (
                  <>
                    {openedSummary ? (
                      <p className="mb-3">
                        <i className="ti ti-circle-check-filled text-success me-1" aria-hidden="true" />
                        {openedSummary}
                      </p>
                    ) : null}
                    {controls(false, openM.round, openM.atMs)}
                  </>
                )}
              </Step>
              <Step id="open" title={t("centrePage.printTitle")} state={opened && !reserve ? "current" : reserve ? "done" : "future"} summary={reserve ? t("centrePage.switchedReserve", { label: reserveLabel }) : undefined}>
                {opened && !reserve ? openedView : undefined}
              </Step>
              {reserveM?.reached && centre ? (
                <Step id="reserve" title={t("centrePage.reserveTitle", { label: reserveLabel })} state="current">
                  <p className="mb-3">{t("centrePage.reserveBody")}</p>
                  <div className="form-check form-switch mb-3">
                    <input className="form-check-input" type="checkbox" role="switch" id="reserve-toggle" checked={reserve} onChange={(ev) => setReserve(ev.target.checked)} data-testid="reserve-toggle" />
                    <label className="form-check-label" htmlFor="reserve-toggle">
                      {t("centrePage.reserveSwitch", { label: reserveLabel })}
                    </label>
                  </div>
                  {reserve ? (
                    <div className="border-top border-dashed pt-3">
                      {controls(true, reserveM.round, reserveM.atMs)}
                      {openedView}
                    </div>
                  ) : null}
                </Step>
              ) : null}
            </>
          )}
        </StepList>
      </div>
      <div className="col-xl-4">
        <ExamTimeline />
      </div>
    </div>
  );
}
