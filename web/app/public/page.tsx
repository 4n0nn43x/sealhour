"use client";
import { Public } from "@/components/public/Public";
import { Page } from "@/components/Shell";
import { useI18n } from "@/lib/i18n";

export default function PublicPage() {
  const { t } = useI18n();
  return (
    <Page title={t("public.title")} intro={t("public.intro")}>
      <Public />
    </Page>
  );
}
