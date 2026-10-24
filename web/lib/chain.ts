// Chain access: one read provider, contract instances, demo signers, and revert decoding.
import { Contract, FetchRequest, Interface, JsonRpcProvider, JsonRpcSigner, Network, Wallet, isHexString, keccak256, type JsonRpcPayload, type JsonRpcResult, type Signer } from "ethers";
import type { AppConfig } from "./config";

const providers = new Map<string, JsonRpcProvider>();

/** JSON-RPC over several URLs: an HTTP or network failure moves to the next URL (and stays there).
 *  JSON-RPC errors (reverts) are answers, not failures: they never switch. Each URL's eth_chainId is checked once,
 *  on first use: a URL on another chain is never used. A raw transaction is never re-broadcast after a failure (it
 *  may have reached the node): the next URLs are polled for its hash instead. */
class FailoverProvider extends JsonRpcProvider {
  private at = 0;
  private readonly chainChecks = new Map<string, Promise<void>>();
  constructor(
    private readonly rpcUrls: string[],
    private readonly net: Network,
    pollingInterval: number,
  ) {
    // cacheTimeout -1: a "pending" nonce read right after a confirmed transaction must not come from ethers' 250 ms
    // request cache (measured: sequential transactions of one burner reused a nonce).
    super(rpcUrls[0], net, { staticNetwork: net, pollingInterval, cacheTimeout: -1 });
  }
  override _getConnection(): FetchRequest {
    return new FetchRequest(this.rpcUrls[this.at]!);
  }
  /** Rejects (for good) a URL serving another chain; a network failure is retried on the next use. */
  private checkChain(url: string): Promise<void> {
    let p = this.chainChecks.get(url);
    if (!p) {
      p = (async () => {
        const req = new FetchRequest(url);
        req.body = { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] };
        const res = await req.send();
        res.assertOk();
        const id = Number((res.bodyJson as { result?: string }).result);
        if (BigInt(id) !== this.net.chainId) throw Object.assign(new Error(`RPC ${url} is on chain ${id}, not ${this.net.chainId}`), { wrongChain: true });
      })();
      p.catch((e: { wrongChain?: boolean }) => {
        if (!e?.wrongChain) this.chainChecks.delete(url);
      });
      this.chainChecks.set(url, p);
    }
    return p;
  }
  private async failover(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    let last: unknown;
    for (let k = 0; k < this.rpcUrls.length; k++) {
      try {
        await this.checkChain(this.rpcUrls[this.at]!);
        return await super._send(payload);
      } catch (e) {
        last = e;
        this.at = (this.at + 1) % this.rpcUrls.length;
      }
    }
    throw last;
  }
  private async sendRaw(p: JsonRpcPayload): Promise<JsonRpcResult[]> {
    try {
      await this.checkChain(this.rpcUrls[this.at]!);
    } catch {
      return this.failover(p); // nothing was broadcast yet
    }
    try {
      return await super._send(p);
    } catch (e) {
      this.at = (this.at + 1) % this.rpcUrls.length;
      const hash = keccak256((p.params as string[])[0]!);
      for (let i = 0; i < 15; i++) {
        const [r] = await this.failover({ ...p, method: "eth_getTransactionByHash", params: [hash] }).catch(() => [undefined]);
        if (r && "result" in r && r.result) return [{ id: p.id, result: hash }];
        await new Promise((res) => setTimeout(res, 2000));
      }
      throw e;
    }
  }
  override async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<JsonRpcResult[]> {
    const list = Array.isArray(payload) ? payload : [payload];
    const isRaw = (x: JsonRpcPayload) => x.method === "eth_sendRawTransaction";
    if (!list.some(isRaw)) return this.failover(payload);
    const rest = list.filter((x) => !isRaw(x));
    const out = rest.length ? await this.failover(rest.length === 1 ? rest[0]! : rest) : [];
    for (const x of list.filter(isRaw)) out.push(...(await this.sendRaw(x)));
    return out;
  }
}

/** Read provider (demo: the local node; live: the public RPCs in order). staticNetwork: no network detection
 *  loop (no console noise when the node is down). Live polls every second (Base Sepolia blocks are 200 ms). */
export function getProvider(cfg: AppConfig): JsonRpcProvider {
  const { chainId } = cfg.deployment;
  const urls = cfg.mode === "live" ? cfg.rpcUrls : [cfg.deployment.rpcUrl];
  const key = `${urls.join(",")}|${chainId}`;
  let p = providers.get(key);
  if (!p) {
    const net = Network.from(chainId);
    p = cfg.mode === "live" ? new FailoverProvider(urls, net, 1000) : new JsonRpcProvider(urls[0], net, { staticNetwork: net, pollingInterval: 2000 });
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
  "NoKey",
  "KeyMismatch",
  "BadKey",
  "Burned",
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
