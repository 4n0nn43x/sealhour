"use client";
import { Enrolement } from "@/components/enrolement/Enrolement";
import { Page } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export default function EnrolementPage() {
  const { t } = useI18n();
  return (
    <Page title={t("enrol.title")} intro={t("enrol.intro")}>
      <Enrolement />
    </Page>
  );
}
