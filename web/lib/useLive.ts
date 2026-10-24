"use client";
// Live session state for Providers: the public live config, injected wallets and the connected one, the session
// (connected wallet on the shared registry, or solo test with burners), its AppConfig and its chain-derived roles.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ConfigResult } from "./config";
import { liveRoles, loadLiveBase, readBurners, readSession, readWalletHint, saveSession, saveWalletHint, soloConfig, walletConfig, type LiveBase, type LiveSession } from "./live";
import type { Role } from "./roles";
import { discoverWallets, switchToBaseSepolia, walletAccounts, walletChainId, watchWallet, type WalletInfo } from "./wallet";

export interface WalletConn {
  info: WalletInfo;
  address: string;
  chainId: number;
}

export interface LiveState {
  base: LiveBase | null;
  baseError: string | null;
  session: LiveSession | null;
  /** Config of the live session (null while loading), "login" without a session. */
  config: ConfigResult | null;
  roles: Role[];
  wallets: WalletInfo[];
  wallet: WalletConn | null;
  /** Ask the wallet for its accounts (popup), remember it. */
  connect: (w: WalletInfo) => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  /** Start (or end, with null) a live session. */
  setSession: (s: LiveSession | null) => void;
  /** Re-read the chain-derived roles (after a registration, a new key, a join). */
  refresh: () => void;
}

/** active: live mode is on (session config and roles). wanted: live mode or the login page; the public config, wallet
 *  discovery and the silent reconnect run only then. */
export function useLive(active: boolean, wanted: boolean): LiveState {
  const [base, setBase] = useState<LiveBase | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [session, setSessionState] = useState<LiveSession | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [wallet, setWallet] = useState<WalletConn | null>(null);
  const [config, setConfig] = useState<ConfigResult | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    setSessionState(readSession());
  }, []);
  const started = useRef(false);
  useEffect(() => {
    if (!wanted || started.current) return;
    started.current = true;
    loadLiveBase()
      .then(setBase)
      .catch((e: unknown) => setBaseError(String((e as Error)?.message ?? e)));
    discoverWallets(setWallets); // kept for the page's lifetime once started (wallets announce once)
  }, [wanted]);

  // Reconnect the remembered wallet without a popup (eth_accounts).
  useEffect(() => {
    const hint = readWalletHint();
    if (!wanted || wallet || !hint) return;
    const w = wallets.find((x) => x.rdns === hint || x.uuid === hint);
    if (!w) return;
    let alive = true;
    void (async () => {
      try {
        const [address] = await walletAccounts(w.provider, false);
        if (alive && address) setWallet({ info: w, address, chainId: await walletChainId(w.provider) });
      } catch {
        /* the wallet stays disconnected until the user connects */
      }
    })();
    return () => {
      alive = false;
    };
  }, [wanted, wallets, wallet]);

  // EIP-1193 events of the connected wallet.
  const provider = wallet?.info.provider;
  useEffect(() => {
    if (!provider) return;
    return watchWallet(provider, {
      accounts: (a) => setWallet((w) => (w && a[0] ? { ...w, address: a[0] } : null)),
      chain: (chainId) => setWallet((w) => (w ? { ...w, chainId } : null)),
      disconnect: () => setWallet(null),
    });
  }, [provider]);

  // The AppConfig of the session. A wallet session re-reads the shared registry on refresh and every 30 s (a new
  // exam, more centres), keeping the same object while nothing changed.
  const reloadWallet = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!active) return;
    if (baseError) return setConfig({ status: "invalid", message: baseError });
    if (!base) return setConfig(null);
    if (!session) return setConfig({ status: "login" });
    if (session.kind === "solo") {
      const b = readBurners();
      try {
        setConfig(b?.registry ? { status: "ok", config: soloConfig(base, b) } : { status: "login" });
      } catch (e) {
        setConfig({ status: "invalid", message: String((e as Error)?.message ?? e) });
      }
      return;
    }
    let alive = true;
    setConfig(null);
    const load = () =>
      void walletConfig(base)
        .then((c) => alive && setConfig((old) => (old?.status === "ok" && JSON.stringify(old.config.demo) === JSON.stringify(c.demo) ? old : { status: "ok", config: c })))
        .catch((e: unknown) => alive && setConfig((old) => (old?.status === "ok" ? old : { status: "invalid", message: String((e as Error)?.message ?? e) })));
    load();
    reloadWallet.current = load;
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      reloadWallet.current = null;
      clearInterval(id);
    };
  }, [active, base, baseError, session]);
  useEffect(() => {
    if (tick) reloadWallet.current?.();
  }, [tick]);

  // Roles from chain state, re-read on refresh and when the connected account changes.
  const cfg = config?.status === "ok" ? config.config : null;
  const address = wallet?.address ?? null;
  useEffect(() => {
    if (!cfg || !session) return;
    let alive = true;
    liveRoles(cfg, session.kind, address)
      .then((r) => alive && setRoles(r))
      .catch(() => alive && setRoles([{ key: "juror", kind: "juror", name: "Juror" }]));
    return () => {
      alive = false;
    };
  }, [cfg, session, address, tick]);

  const connect = useCallback(async (w: WalletInfo) => {
    const [a] = await walletAccounts(w.provider, true);
    if (!a) throw new Error("NoAccount");
    saveWalletHint(w.rdns || w.uuid);
    setWallet({ info: w, address: a, chainId: await walletChainId(w.provider) });
  }, []);
  const disconnect = useCallback(() => {
    saveWalletHint(null);
    setWallet(null);
  }, []);
  const switchChain = useCallback(async () => {
    if (!provider) throw new Error("NoWallet");
    await switchToBaseSepolia(provider);
    const chainId = await walletChainId(provider);
    setWallet((w) => (w ? { ...w, chainId } : null));
  }, [provider]);
  const setSession = useCallback((s: LiveSession | null) => {
    saveSession(s);
    setSessionState(s);
    setRoles([]);
  }, []);

  return useMemo(
    () => ({ base, baseError, session, config, roles, wallets, wallet, connect, disconnect, switchChain, setSession, refresh }),
    [base, baseError, session, config, roles, wallets, wallet, connect, disconnect, switchChain, setSession, refresh],
  );
}
