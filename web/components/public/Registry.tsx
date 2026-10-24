"use client";
// Everything public on chain, folded in one collapsible: the frozen centre list (with joins) and the packages.
import { useConfig } from "../Providers";
import { FrozenList, VerifyDetails } from "../blocks";
import { useI18n } from "@/lib/i18n";
import { setLabel, type ExamSnapshot } from "@/lib/registry";
import { Chip, Hex } from "../ui";

export function Registry({ snap }: { snap: ExamSnapshot }) {
  const cfg = useConfig();
  const { t } = useI18n();
  const e = snap.exam;
  return (
    <section className="card" id="registry" aria-labelledby="registry-title">
      <div className="card-header border-bottom border-dashed">
        <h2 className="header-title" id="registry-title">
          {t("publicPage.registryTitle")}
        </h2>
      </div>
      <div className="card-body">
        <p className="text-muted mb-0">
          {cfg.demo.examTitle}: {t("frozen.summary", { n: e.frozen ? e.centreCount : "-", announced: cfg.demo.announcedCentreCount })}
        </p>
        <VerifyDetails title={t("publicPage.registryShow")} testId="registry-details">
          <p className="mb-3">
            {t("publicPage.examId")} <Hex value={snap.examId} head={10} tail={8} />
          </p>
          <h3 className="fs-14 fw-semibold mb-2">{t("public.centresTitle")}</h3>
          <FrozenList
            centres={snap.centres}
            frozen={e.frozen}
            count={e.centreCount}
            announced={cfg.demo.announcedCentreCount}
            listRoot={e.listRoot}
            participations={snap.participations}
            tableTestId="public-centres"
            inline
          />
          {e.created ? (
            <>
              <h3 className="fs-14 fw-semibold mt-4 mb-2">{t("public.packagesTitle")}</h3>
              <div className="table-responsive">
                <table className="table table-borderless table-hover table-nowrap align-middle mb-0" data-testid="public-packages">
                  <thead className="bg-light bg-opacity-50">
                    <tr className="text-uppercase fs-12">
                      <th scope="col" className="text-muted">{t("public.set")}</th>
                      <th scope="col" className="text-muted">{t("publicPage.fingerprint")}</th>
                      <th scope="col" className="text-muted">{t("public.committee")}</th>
                      <th scope="col" className="text-muted">{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snap.packages.map((p) => (
                      <tr key={p.setIndex}>
                        <td className="fw-medium">{setLabel(cfg, p.setIndex, e.setCount)}</td>
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
            </>
          ) : null}
        </VerifyDetails>
      </div>
    </section>
  );
}
