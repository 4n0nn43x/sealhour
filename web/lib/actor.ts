"use client";
// The signer of the acting role (demo wallet; the office signs through the node's unlocked
// account), or null for the public juror.
import { useMemo } from "react";
import type { JsonRpcSigner, Wallet } from "ethers";
import { useApp, useConfig } from "@/components/Providers";
import { demoWallet, nodeAccountSigner } from "./chain";
import type { Role } from "./roles";

export function useActor(): { role: Role | undefined; wallet: Wallet | JsonRpcSigner | null } {
  const cfg = useConfig();
  const { role } = useApp();
  const wallet = useMemo(() => {
    if (role?.account?.privateKey) return demoWallet(cfg, role.account.privateKey);
    if (role?.kind === "office" && role.account?.address) return nodeAccountSigner(cfg, role.account.address);
    return null;
  }, [cfg, role]);
  return { role, wallet };
}
