"use client";
// The signer of the acting role, or null. Demo: the role's demo wallet (the office signs through the node's
// unlocked account; the public juror has none). Live: a burner wallet (solo test) or the connected wallet, only
// when it is on Base Sepolia and is the role's address (or for the public juror, who acts as the wallet itself).
import { useMemo } from "react";
import type { JsonRpcSigner, Wallet } from "ethers";
import { useApp, useConfig } from "@/components/Providers";
import { demoWallet, nodeAccountSigner } from "./chain";
import type { Role } from "./roles";
import { walletSigner } from "./wallet";

export function useActor(): { role: Role | undefined; wallet: Wallet | JsonRpcSigner | null } {
  const cfg = useConfig();
  const { role, live } = useApp();
  const conn = cfg.mode === "live" ? live.wallet : null;
  const wallet = useMemo(() => {
    if (role?.account?.privateKey) return demoWallet(cfg, role.account.privateKey);
    if (cfg.mode === "live") {
      if (!conn || conn.chainId !== cfg.deployment.chainId) return null;
      const mine = role?.kind === "juror" || role?.account?.address.toLowerCase() === conn.address.toLowerCase();
      return mine ? walletSigner(conn.info.provider, conn.address) : null;
    }
    if (role?.kind === "office" && role.account?.address) return nodeAccountSigner(cfg, role.account.address);
    return null;
  }, [cfg, role, conn]);
  return { role, wallet };
}
