// Shared helpers for the SealHour scripts: paths, JSON files, quiet tlock logs, chain access.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_DIR = path.resolve(here, "..");
export const SHARED_DIR = path.join(APP_DIR, "shared");
export const FILES = {
  beaconKey: path.join(SHARED_DIR, "beacon-key.json"),
  beaconInfo: path.join(SHARED_DIR, "beacon-info.json"),
  deployment: path.join(SHARED_DIR, "deployment.json"),
  demoState: path.join(SHARED_DIR, "demo-state.json"),
  setsDir: path.join(SHARED_DIR, "sets"),
  packagesDir: path.join(SHARED_DIR, "packages"),
};

export const DEFAULT_BEACON_URL = "http://127.0.0.1:8787";
export const DEFAULT_RPC_URL = "http://127.0.0.1:8545";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

/** Minimal argv parser: --name value, --flag. */
export function parseArgs(argv, spec) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`unexpected argument ${a}`);
    const name = a.slice(2);
    if (!(name in spec)) throw new Error(`unknown option --${name}`);
    if (spec[name] === "flag") out[name] = true;
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`--${name} needs a value`);
      out[name] = spec[name] === "int" ? toPositiveInt(name, v) : v;
    }
  }
  return out;
}

function toPositiveInt(name, v) {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer, got ${v}`);
  return n;
}

/**
 * tlock-js prints every beacon it receives with console.log. Drop exactly those lines and keep the
 * rest of the output intact.
 */
export function silenceTlockLogs() {
  const orig = console.log;
  console.log = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("beacon received:")) return;
    orig(...args);
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadDeployment() {
  if (!fs.existsSync(FILES.deployment)) throw new Error(`${FILES.deployment} is missing: deploy the contract first`);
  return readJson(FILES.deployment);
}

/**
 * Hardhat automine stamps each block at max(now, previous + 1) seconds, so a burst of transactions
 * pushes chain time ahead of the wall clock (measured: 20 txs, 18 s ahead) and the contract would
 * see the opening round before the beacon emits it. On a Hardhat node, switch to one block per
 * second (interval mining, like a real L2): block timestamps then follow the wall clock.
 * Other nodes are left untouched.
 */
export async function ensureWallClockMining(provider) {
  let client = "";
  try {
    client = await provider.send("web3_clientVersion", []);
  } catch {
    return false;
  }
  if (!/hardhat/i.test(client)) return false;
  await provider.send("evm_setAutomine", [false]);
  await provider.send("evm_setIntervalMining", [1000]);
  return true;
}

/** Name of a custom error from an ethers v6 call failure, or undefined. */
export function revertName(err, iface) {
  if (err?.revert?.name) return err.revert.name;
  const data = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
  if (typeof data === "string" && data.length >= 10) {
    try {
      return iface.parseError(data)?.name;
    } catch {
      /* not one of ours */
    }
  }
  return undefined;
}

/**
 * Beacon pin stored in the contract (constructor immutables), as lowercase hex without 0x, checked
 * against deployment.json when given. Every relay client is built with this pin.
 */
export async function readBeaconPin(registry, deployment) {
  const strip = (h) => String(h).replace(/^0x/, "").toLowerCase();
  const pin = { chainHash: strip(await registry.beaconChainHash()), publicKey: strip(await registry.beaconPublicKey()) };
  if (deployment && (strip(deployment.beaconChainHash ?? "") !== pin.chainHash || strip(deployment.beaconPublicKey ?? "") !== pin.publicKey)) {
    throw new Error("deployment.json beacon pin differs from the pin stored in the contract");
  }
  return pin;
}

export function centreIdOf(name) {
  return ethers.keccak256(ethers.toUtf8Bytes(name));
}
