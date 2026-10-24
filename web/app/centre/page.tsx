"use client";
import { Centre } from "@/components/centre/Centre";
import { Page } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export default function CentrePage() {
  const { t } = useI18n();
  return (
    <Page title={t("centre.title")} intro={t("centre.intro")}>
      <Centre />
    </Page>
  );
}
