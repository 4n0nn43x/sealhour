// Chain access: one read provider, contract instances, demo signers, and revert decoding.
import { Contract, Interface, JsonRpcProvider, JsonRpcSigner, Network, Wallet, isHexString, type Signer } from "ethers";
import type { AppConfig } from "./config";

const providers = new Map<string, JsonRpcProvider>();

/** Read provider. staticNetwork: no network detection loop (no console noise when the node is down). */
export function getProvider(cfg: AppConfig): JsonRpcProvider {
  const { rpcUrl, chainId } = cfg.deployment;
  const key = `${rpcUrl}|${chainId}`;
  let p = providers.get(key);
  if (!p) {
    const net = Network.from(chainId);
    p = new JsonRpcProvider(rpcUrl, net, { staticNetwork: net, pollingInterval: 2000 });
    providers.set(key, p);
  }
  return p;
}

export function registry(cfg: AppConfig, runner?: Signer): Contract {
  return new Contract(cfg.deployment.address, cfg.deployment.abi, runner ?? getProvider(cfg));
}

/** Wallet from a demo private key (local throwaway key from demo-state.json). Never logged. */
export function demoWallet(cfg: AppConfig, privateKey: string): Wallet {
  return new Wallet(privateKey, getProvider(cfg));
}

/** The office's unlocked account on the local node: the office has no key in demo-state.json. */
export function nodeAccountSigner(cfg: AppConfig, address: string): JsonRpcSigner {
  return new JsonRpcSigner(getProvider(cfg), address);
}

/** An unlocked account of the local node (Hardhat), for actions of a public juror who holds no demo key. */
export async function nodeSigner(cfg: AppConfig): Promise<Signer> {
  const p = getProvider(cfg);
  const accounts = await p.listAccounts();
  if (accounts.length === 0) throw new Error("NoNodeAccount");
  return accounts[accounts.length - 1]!;
}

const CUSTOM_ERRORS = [
  "NotOffice",
  "KeyFrozen",
  "NotFrozen",
  "BadList",
  "BadRounds",
  "TooLate",
  "TooEarly",
  "NotCommittee",
  "NotCentre",
  "AlreadyDone",
  "LastSet",
] as const;
export type CustomError = (typeof CUSTOM_ERRORS)[number];

function findRevertData(e: unknown, depth = 0): string | undefined {
  if (depth > 6 || e === null || typeof e !== "object") return undefined;
  const o = e as Record<string, unknown>;
  for (const k of ["data", "error", "info", "cause", "payload"]) {
    const v = o[k];
    if (typeof v === "string" && isHexString(v) && v.length >= 10) return v;
    const nested = findRevertData(v, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/** Name of the SealRegistry custom error behind a failed call or transaction, if any. */
export function revertName(e: unknown, cfg?: AppConfig): CustomError | undefined {
  const o = e as { revert?: { name?: string } } | undefined;
  const direct = o?.revert?.name;
  if (direct && (CUSTOM_ERRORS as readonly string[]).includes(direct)) return direct as CustomError;
  const data = findRevertData(e);
  if (data && cfg) {
    try {
      const parsed = new Interface(cfg.deployment.abi).parseError(data);
      if (parsed && (CUSTOM_ERRORS as readonly string[]).includes(parsed.name)) return parsed.name as CustomError;
    } catch {
      /* not a custom error of the registry */
    }
  }
  const msg = String((e as Error)?.message ?? "");
  const m = /reverted with custom error '(\w+)\(/.exec(msg);
  if (m && (CUSTOM_ERRORS as readonly string[]).includes(m[1]!)) return m[1] as CustomError;
  return undefined;
}

export interface TxResult {
  hash: string;
  block: number | null;
}

/** Send a contract call and wait for its receipt. Reverts surface before sending (gas estimation). */
export async function sendTx(contract: Contract, method: string, args: unknown[]): Promise<TxResult> {
  const fn = contract.getFunction(method);
  const tx = await fn(...args);
  const receipt = await tx.wait();
  return { hash: tx.hash as string, block: receipt?.blockNumber ?? null };
}

export function shortHex(h: string | undefined | null, head = 6, tail = 4): string {
  if (!h) return "";
  if (h.length <= head + tail + 2) return h;
  return `${h.slice(0, head + 2)}...${h.slice(-tail)}`;
}

export const ZERO32 = "0x" + "0".repeat(64);
