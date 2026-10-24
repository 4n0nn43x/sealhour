"use client";
// Everything public about the exam: frozen centre list, rounds with times, package roots, burned sets, joins.
import { useConfig } from "../Providers";
import { roundTimeMs, type BeaconState } from "@/lib/beacon";
import { formatTime, useI18n } from "@/lib/i18n";
import { setLabel, type ExamSnapshot } from "@/lib/registry";
import { Chip, Hex, Section } from "../ui";

export function Overview({ snap, b }: { snap: ExamSnapshot; b: BeaconState }) {
  const cfg = useConfig();
  const { t, locale } = useI18n();
  const e = snap.exam;
  const rounds: { key: string; label: string; round: number }[] = [
    { key: "open", label: t("rounds.open"), round: e.openRound },
    { key: "reveal", label: t("rounds.reveal"), round: e.revealRound },
    { key: "reserveOpen", label: t("rounds.reserveOpen"), round: e.reserveOpenRound },
    { key: "reserveReveal", label: t("rounds.reserveReveal"), round: e.reserveRevealRound },
  ];
  return (
    <>
      <Section title={t("public.examTitle")} id="exam">
        <dl className="kv">
          <dt>{t("public.exam")}</dt>
          <dd>
            {cfg.demo.examTitle} <Hex value={snap.examId} />
          </dd>
          <dt>{t("enrol.listRoot")}</dt>
          <dd>
            <Hex value={e.frozen ? e.listRoot : null} head={10} tail={8} />
          </dd>
          <dt>{t("enrol.onChainCount")}</dt>
          <dd>{e.frozen ? e.centreCount : "-"}</dd>
          <dt>{t("enrol.announced")}</dt>
          <dd>{cfg.demo.announcedCentreCount}</dd>
        </dl>
      </Section>
      <Section title={t("public.centresTitle")} id="pub-centres">
        <div className="table-wrap">
          <table data-testid="public-centres">
            <thead>
              <tr>
                <th scope="col">{t("common.name")}</th>
                <th scope="col">{t("common.key")}</th>
                <th scope="col">{t("public.joined")}</th>
              </tr>
            </thead>
            <tbody>
              {snap.centres.map((c) => {
                const p = snap.participations.find((x) => x.centreId === c.centreId);
                return (
                  <tr key={c.centreId}>
                    <td>{c.name}</td>
                    <td>
                      <Hex value={c.pubKey} />
                    </td>
                    <td>
                      <Chip ok={p?.joined ?? false}>{p?.joined ? t("common.yes") : t("common.no")}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      {e.created ? (
        <>
          <Section title={t("public.roundsTitle")} id="rounds">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t("public.what")}</th>
                    <th scope="col">{t("public.round")}</th>
                    <th scope="col">{t("public.time")}</th>
                    <th scope="col">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rounds.map((r) => (
                    <tr key={r.key}>
                      <td>{r.label}</td>
                      <td>{r.round}</td>
                      <td>{formatTime(roundTimeMs(cfg, b.info, r.round), locale)}</td>
                      <td>
                        <Chip ok={b.round >= r.round ? true : null}>{b.round >= r.round ? t("public.passed") : t("public.upcoming")}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title={t("public.packagesTitle")} id="packages">
            <div className="table-wrap">
              <table data-testid="public-packages">
                <thead>
                  <tr>
                    <th scope="col">{t("public.set")}</th>
                    <th scope="col">{t("public.root")}</th>
                    <th scope="col">{t("public.committee")}</th>
                    <th scope="col">{t("common.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {snap.packages.map((p) => (
                    <tr key={p.setIndex}>
                      <td>{setLabel(cfg, p.setIndex, e.setCount)}</td>
                      <td>
                        <Hex value={p.submitted ? p.root : null} head={8} tail={6} />
                      </td>
                      <td>
                        <Hex value={p.committee} />
                      </td>
                      <td>
                        {p.burned ? <Chip ok={false}>{t("comite.burned")}</Chip> : null}{" "}
                        <Chip ok={p.submitted ? true : null}>{p.submitted ? t("public.published") : t("public.notPublished")}</Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      ) : null}
    </>
  );
}
