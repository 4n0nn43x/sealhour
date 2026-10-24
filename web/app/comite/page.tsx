"use client";
import { Comite } from "@/components/comite/Comite";
import { Page } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export default function ComitePage() {
  const { t } = useI18n();
  return (
    <Page title={t("comite.title")} intro={t("comite.intro")}>
      <Comite />
    </Page>
  );
}
