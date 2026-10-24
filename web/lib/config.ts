// Runtime configuration, fetched once from /config.json (copied by `make demo` from app/shared).
import type { InterfaceAbi } from "ethers";

export interface Deployment {
  address: string;
  abi: InterfaceAbi;
  chainId: number;
  rpcUrl: string;
  genesisTime: number;
  period: number;
  /** Beacon pin written by deploy.js (same values as the contract immutables): hex without 0x. */
  beaconChainHash?: string;
  beaconPublicKey?: string;
  office: string;
  deployedAt?: string;
}

export interface DemoAccount {
  address: string;
  /** null for the office: it signs through the node's unlocked account. */
  privateKey: string | null;
}

export interface DemoCommittee extends DemoAccount {
  setIndex: number;
  label: string;
}

export interface DemoCentre extends DemoAccount {
  centreId: string;
  name: string;
  identity: string;
  recipient: string;
  rcHex: string;
}

export interface DemoState {
  examId: string;
  examTitle: string;
  subject: string;
  beaconUrl?: string;
  rpcUrl?: string;
  contract?: string;
  rounds: { open: number; reveal: number; reserveOpen: number; reserveReveal: number };
  announcedCentreCount: number;
  office: DemoAccount;
  committees: DemoCommittee[];
  reserveCommittee: DemoCommittee;
  centres: DemoCentre[];
  packages: { setIndex: number; root: string; uri: string }[];
  phantom: { centreId: string; name: string };
}

export interface AppConfig {
  deployment: Deployment;
  demo: DemoState;
  beaconUrl: string;
  packagesBaseUrl: string;
}

export type ConfigResult =
  | { status: "ok"; config: AppConfig }
  | { status: "missing" }
  | { status: "invalid"; message: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Light shape check: enough to fail early with a readable message instead of deep in a screen. */
export function validateConfig(raw: unknown): AppConfig {
  if (!isObj(raw)) throw new Error("config.json is not an object");
  const d = raw.deployment;
  const demo = raw.demo;
  if (!isObj(d) || typeof d.address !== "string" || !Array.isArray(d.abi) || typeof d.rpcUrl !== "string") {
    throw new Error("config.json: deployment must hold address, abi and rpcUrl (app/shared/deployment.json)");
  }
  if (typeof d.genesisTime !== "number" || typeof d.period !== "number") {
    throw new Error("config.json: deployment.genesisTime and deployment.period are required");
  }
  if (!isObj(demo) || typeof demo.examId !== "string" || !Array.isArray(demo.committees) || !Array.isArray(demo.centres)) {
    throw new Error("config.json: demo must be app/shared/demo-state.json (examId, committees, centres)");
  }
  if (!isObj(demo.office) || !isObj(demo.reserveCommittee) || !isObj(demo.phantom)) {
    throw new Error("config.json: demo.office, demo.reserveCommittee and demo.phantom are required");
  }
  const beaconUrl = typeof raw.beaconUrl === "string" ? raw.beaconUrl : typeof demo.beaconUrl === "string" ? demo.beaconUrl : "";
  if (!beaconUrl) throw new Error("config.json: beaconUrl is required");
  const packagesBaseUrl = typeof raw.packagesBaseUrl === "string" ? raw.packagesBaseUrl : "/shared";
  return {
    deployment: d as unknown as Deployment,
    demo: demo as unknown as DemoState,
    beaconUrl: beaconUrl.replace(/\/+$/, ""),
    packagesBaseUrl: packagesBaseUrl.replace(/\/+$/, ""),
  };
}

export async function loadConfig(): Promise<ConfigResult> {
  let res: Response;
  try {
    res = await fetch("/config.json", { cache: "no-store" });
  } catch {
    return { status: "missing" };
  }
  if (res.status === 404) return { status: "missing" };
  if (!res.ok) return { status: "invalid", message: `HTTP ${res.status}` };
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return { status: "invalid", message: "config.json is not valid JSON" };
  }
  try {
    return { status: "ok", config: validateConfig(raw) };
  } catch (e) {
    return { status: "invalid", message: (e as Error).message };
  }
}

/** URL of a shared file (package index, ciphertext, set draft) relative to packagesBaseUrl. */
export function sharedUrl(cfg: AppConfig, rel: string): string {
  return `${cfg.packagesBaseUrl}/${rel.replace(/^\/+/, "")}`;
}

export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson<T>(url: string): Promise<T> {
  return JSON.parse(await fetchText(url)) as T;
}
