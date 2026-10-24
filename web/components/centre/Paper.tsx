"use client";
// Printable exam paper of the centre, with its typographic fingerprint. Print CSS shows only this block.
import type { Rendering } from "@sealhour/seal";
import { shortHex } from "@/lib/chain";
import { useI18n } from "@/lib/i18n";

export function Paper({
  examTitle,
  subject,
  setLabel,
  centreName,
  round,
  sig,
  rendering,
}: {
  examTitle: string;
  subject: string;
  setLabel: string;
  centreName: string;
  round: number;
  sig: string;
  rendering: Rendering;
}) {
  const { t } = useI18n();
  return (
    <>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          {t("centre.print")}
        </button>
      </div>
      <article className="paper print-area" aria-label={t("centre.paper")} data-testid="paper">
        <header className="paper-head">
          <p className="paper-title">{examTitle}</p>
          <p>
            {subject} · {setLabel} · {t("centre.paperCentre", { name: centreName })}
          </p>
        </header>
        <pre className="paper-body">{rendering.text}</pre>
        <footer className="paper-foot">
          {t("centre.fingerprint")} <code>{rendering.marks}</code> · {t("countdown.round", { n: round })} · {shortHex(sig, 8, 8)}
        </footer>
      </article>
    </>
  );
}
