"use client";
import Link from "next/link";
import { Page } from "@/components/Shell";
import { useApp } from "@/components/Providers";
import { useI18n } from "@/lib/i18n";
import { SetupMessage } from "@/components/Shell";
import type { DictKey } from "@/lib/dict";

const SCREENS: { href: string; title: DictKey; body: DictKey }[] = [
  { href: "/enrolment/", title: "nav.enrolement", body: "home.enrolement" },
  { href: "/committee/", title: "nav.comite", body: "home.comite" },
  { href: "/centre/", title: "nav.centre", body: "home.centre" },
  { href: "/public/", title: "nav.public", body: "home.public" },
];

export default function Home() {
  const { t } = useI18n();
  const { config } = useApp();
  return (
    <Page title={t("home.title")} needsConfig={false}>
      <ol className="pitch">
        <li>{t("home.line1")}</li>
        <li>{t("home.line2")}</li>
        <li>{t("home.line3")}</li>
      </ol>
      <ul className="screens">
        {SCREENS.map((s) => (
          <li key={s.href} className="card">
            <h2>
              <Link href={s.href}>{t(s.title)}</Link>
            </h2>
            <p>{t(s.body)}</p>
          </li>
        ))}
      </ul>
      {config?.status === "missing" ? <SetupMessage /> : null}
      {config?.status === "invalid" ? <SetupMessage reason={config.message} /> : null}
    </Page>
  );
}
