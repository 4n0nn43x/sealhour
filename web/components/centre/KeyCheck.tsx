"use client";
// The centre application refuses to open if its key is not the one registered on chain (or its r_c differs).
import { useEffect, useState } from "react";
import { identityToRecipient } from "age-encryption";
import { commitRc } from "@sealhour/seal";
import type { DemoCentre } from "@/lib/config";
import { useI18n } from "@/lib/i18n";
import type { CentreInfo, ParticipationInfo } from "@/lib/registry";
import { Chip } from "../ui";

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

/** The four device checks, one line each (shown in the Device ready step's details). */
export function KeyChecks({ v }: { v: KeyVerdict }) {
  const { t } = useI18n();
  const row = (ok: boolean | null, label: string) => (
    <li className="d-flex align-items-center gap-2">
      <Chip ok={ok}>{ok === null ? "-" : ok ? t("common.yes") : t("common.no")}</Chip> {label}
    </li>
  );
  return (
    <ul className="list-unstyled vstack gap-2 mb-0">
      {row(v.listed, t("centre.listed"))}
      {row(v.keyOk, t("centre.keyMatches"))}
      {row(v.joined, t("centre.joined"))}
      {row(v.rcOk, t("centre.rcMatches"))}
    </ul>
  );
}
