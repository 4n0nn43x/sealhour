"use client";
// Browser wallets for live mode, no extra dependency: EIP-6963 discovery of injected wallets, EIP-1193 requests,
// switch (or add) Base Sepolia, ethers BrowserProvider signer. Reads never go through the wallet (lib/chain.ts).
import { BrowserProvider, JsonRpcSigner, type TransactionRequest } from "ethers";

export interface Eip1193 {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WalletInfo {
  uuid: string;
  name: string;
  /** data: URI announced by the wallet (EIP-6963), shown in an <img>. */
  icon: string;
  /** Self-attested reverse DNS name: display and reconnect hint only. */
  rdns: string;
  provider: Eip1193;
}

export const BASE_SEPOLIA_ID = 84532;

/** EIP-3085 parameters of Base Sepolia. */
export const BASE_SEPOLIA = {
  chainId: "0x14a34",
  chainName: "Base Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://sepolia.base.org"],
  blockExplorerUrls: ["https://sepolia.basescan.org"],
};

/** Listen for EIP-6963 announcements (deduplicated by uuid) and ask wallets to announce. Falls back to
 *  window.ethereum as "Browser wallet" when nothing announces within 400 ms. Returns the unsubscribe. */
export function discoverWallets(onChange: (list: WalletInfo[]) => void): () => void {
  const list: WalletInfo[] = [];
  const onAnnounce = (e: Event) => {
    const d = (e as CustomEvent<{ info: Omit<WalletInfo, "provider">; provider: Eip1193 }>).detail;
    if (!d?.info?.uuid || !d.provider || list.some((w) => w.uuid === d.info.uuid)) return;
    list.push({ ...d.info, provider: d.provider });
    onChange([...list]);
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  const fallback = setTimeout(() => {
    const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
    if (list.length === 0 && eth) {
      list.push({ uuid: "window.ethereum", name: "Browser wallet", icon: "", rdns: "window.ethereum", provider: eth });
      onChange([...list]);
    }
  }, 400);
  return () => {
    clearTimeout(fallback);
    window.removeEventListener("eip6963:announceProvider", onAnnounce);
  };
}

/** Accounts already authorised for this site (no popup), or after asking (popup) when ask is true. */
export async function walletAccounts(p: Eip1193, ask: boolean): Promise<string[]> {
  const a = (await p.request({ method: ask ? "eth_requestAccounts" : "eth_accounts" })) as string[];
  return Array.isArray(a) ? a : [];
}

export async function walletChainId(p: Eip1193): Promise<number> {
  return Number(await p.request({ method: "eth_chainId" }));
}

/** Switch the wallet to Base Sepolia, adding the network first when the wallet does not know it (4902). */
export async function switchToBaseSepolia(p: Eip1193): Promise<void> {
  try {
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA.chainId }] });
  } catch (e) {
    const code = (e as { code?: number; data?: { originalError?: { code?: number } } })?.code ?? (e as { data?: { originalError?: { code?: number } } })?.data?.originalError?.code;
    if (code !== 4902) throw e;
    await p.request({ method: "wallet_addEthereumChain", params: [BASE_SEPOLIA] });
    await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BASE_SEPOLIA.chainId }] });
  }
}

/** Signer that asks the wallet for its chain (eth_chainId) right before every send and refuses anything but Base
 *  Sepolia; the request also carries chainId 84532, so a wallet that switched meanwhile rejects it. */
class BaseSepoliaSigner extends JsonRpcSigner {
  constructor(
    private readonly eip1193: Eip1193,
    address: string,
  ) {
    super(new BrowserProvider(eip1193, "any"), address);
  }
  override async sendUncheckedTransaction(tx: TransactionRequest): Promise<string> {
    if ((await walletChainId(this.eip1193)) !== BASE_SEPOLIA_ID) throw new Error("WrongChain");
    return super.sendUncheckedTransaction({ ...tx, chainId: BASE_SEPOLIA_ID });
  }
}

/** ethers signer for a connected account. "any" network: ethers keeps working across chain changes; every send
 *  re-checks the wallet's chain (BaseSepoliaSigner). */
export function walletSigner(p: Eip1193, address: string): JsonRpcSigner {
  return new BaseSepoliaSigner(p, address);
}

/** Subscribe to the EIP-1193 events that change the session. Returns the unsubscribe. */
export function watchWallet(p: Eip1193, on: { accounts: (a: string[]) => void; chain: (id: number) => void; disconnect: () => void }): () => void {
  const accounts = (a: unknown) => on.accounts(Array.isArray(a) ? (a as string[]) : []);
  const chain = (id: unknown) => on.chain(Number(id));
  const disconnect = () => on.disconnect();
  p.on?.("accountsChanged", accounts);
  p.on?.("chainChanged", chain);
  p.on?.("disconnect", disconnect);
  return () => {
    p.removeListener?.("accountsChanged", accounts);
    p.removeListener?.("chainChanged", chain);
    p.removeListener?.("disconnect", disconnect);
  };
}
