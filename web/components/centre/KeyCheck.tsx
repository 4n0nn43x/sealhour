"use client";
// The centre application refuses to open if its key is not the one registered on chain.
import { useEffect, useState } from "react";
import { identityToRecipient } from "age-encryption";
import { commitRc } from "@sealhour/seal";
import type { DemoCentre } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import type { CentreInfo, ParticipationInfo } from "@/lib/registry";
import { Chip, Notice, Section } from "../ui";

export interface KeyVerdict {
  keyOk: boolean;
  listed: boolean;
  joined: boolean;
  rcOk: boolean | null;
}

export function useKeyCheck(centre: DemoCentre, onChain: CentreInfo | undefined, part: ParticipationInfo | undefined): KeyVerdict | null {
  const [derived, setDerived] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setDerived(undefined);
    identityToRecipient(centre.identity.trim())
      .then((r) => alive && setDerived(r))
      .catch(() => alive && setDerived(null));
    return () => {
      alive = false;
    };
  }, [centre.identity]);
  if (derived === undefined) return null;
  const keyOk = Boolean(derived && onChain?.recipient && derived === onChain.recipient);
  let rcOk: boolean | null = null;
  if (part?.joined) {
    try {
      rcOk = commitRc(centre.rcHex).toLowerCase() === part.rcCommit.toLowerCase();
    } catch {
      rcOk = false;
    }
  }
  return { keyOk, listed: Boolean(onChain), joined: Boolean(part?.joined), rcOk };
}

export function KeyCheck({ v }: { v: KeyVerdict | null }) {
  const { t } = useI18n();
  if (!v) return null;
  return (
    <Section title={t("centre.keyTitle")} id="key" aside={<Chip ok={v.keyOk && v.listed}>{v.keyOk && v.listed ? t("centre.keyOk") : t("centre.keyBad")}</Chip>}>
      <ul className="checks">
        <li>
          <Chip ok={v.listed}>{v.listed ? t("common.yes") : t("common.no")}</Chip> {t("centre.listed")}
        </li>
        <li>
          <Chip ok={v.keyOk}>{v.keyOk ? t("common.yes") : t("common.no")}</Chip> {t("centre.keyMatches")}
        </li>
        <li>
          <Chip ok={v.joined}>{v.joined ? t("common.yes") : t("common.no")}</Chip> {t("centre.joined")}
        </li>
        <li>
          <Chip ok={v.rcOk}>{v.rcOk === null ? "-" : v.rcOk ? t("common.yes") : t("common.no")}</Chip> {t("centre.rcMatches")}
        </li>
      </ul>
      {!v.keyOk || !v.listed ? (
        <Notice tone="error" testId="key-blocked">
          {t("centre.blocked")}
        </Notice>
      ) : null}
    </Section>
  );
}
