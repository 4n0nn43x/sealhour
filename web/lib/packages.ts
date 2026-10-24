// Sealed package files. Two stores, chosen by the package URI on chain:
// - a relative path (demo): static files under packagesBaseUrl (plan B of IPFS);
// - "chain:" (live): the files posted on chain with postPackageData, read back from exactly the recorded blocks.
// Integrity is the same in both: leaves recomputed from the files must hash to the Merkle root on chain.
import { merkleRoot, packageLeaf } from "@sealhour/seal";
import { concat, sha256, toUtf8Bytes, toUtf8String } from "ethers";
import { registry, ZERO32 } from "./chain";
import { fetchJson, fetchText, sharedUrl, type AppConfig } from "./config";

/** URI of a package whose files are on chain (PackageData events). */
export const CHAIN_URI = "chain:";
/** postPackageData accepts at most 64 KiB per part (SealRegistry MAX_DATA). */
const MAX_PART = 64 * 1024;

/** A package as listed on chain, enough to find and check its files. */
export interface PackageRef {
  examId: string;
  setIndex: number;
  uri: string;
  root: string;
}

export interface PackageIndex {
  setIndex: number;
  label: string;
  round: number;
  root: string;
  items: { centreId: string; file: string; leaf: string }[];
  publicCopy?: string;
}

export function packageUri(examId: string, setIndex: number): string {
  return `packages/${examId}/set-${setIndex}/index.json`;
}

function dirOf(uri: string): string {
  const i = uri.lastIndexOf("/");
  return i < 0 ? "" : uri.slice(0, i + 1);
}

export async function fetchPackageIndex(cfg: AppConfig, uri: string): Promise<PackageIndex> {
  const idx = await fetchJson<PackageIndex>(sharedUrl(cfg, uri));
  if (!idx || !Array.isArray(idx.items)) throw new Error(`invalid package index at ${uri}`);
  return idx;
}

export function ciphertextLeaf(centreId: string, ciphertext: string): string {
  return packageLeaf(centreId, sha256(toUtf8Bytes(ciphertext)));
}

export interface FetchedCiphertext {
  index: PackageIndex;
  file: string;
  url: string;
  ciphertext: string;
  /** sha256 of the file matches the leaf listed in the index. */
  leafOk: boolean;
  /** Merkle root of the index leaves equals the root published on chain. */
  rootOk: boolean;
}

/** Fetch a centre's ciphertext from a package and check it against the on chain root. */
export async function fetchCentreCiphertext(cfg: AppConfig, ref: PackageRef, centreId: string): Promise<FetchedCiphertext> {
  const files = ref.uri === CHAIN_URI ? await readChainBundle(cfg, ref.examId, ref.setIndex) : null;
  const index = files ? parseIndex(files) : await fetchPackageIndex(cfg, ref.uri);
  const item = index.items.find((it) => it.centreId.toLowerCase() === centreId.toLowerCase());
  if (!item) throw new Error("CentreNotInPackage");
  const url = files ? `${CHAIN_URI}set-${ref.setIndex}/${item.file}` : sharedUrl(cfg, dirOf(ref.uri) + item.file);
  const ciphertext = files ? files[item.file] ?? "" : await fetchText(url);
  const leafOk = ciphertextLeaf(item.centreId, ciphertext).toLowerCase() === item.leaf.toLowerCase();
  const rootOk = merkleRoot(index.items.map((it) => it.leaf)).toLowerCase() === ref.root.toLowerCase();
  return { index, file: item.file, url, ciphertext, leafOk, rootOk };
}

/** The public copy (tlocked to the reveal round). Outside the Merkle tree: opening it is its check. */
export async function fetchPublicCopy(cfg: AppConfig, ref: PackageRef): Promise<string> {
  if (ref.uri === CHAIN_URI) {
    const files = await readChainBundle(cfg, ref.examId, ref.setIndex);
    return files[parseIndex(files).publicCopy ?? "public.tlock"] ?? "";
  }
  const index = await fetchPackageIndex(cfg, ref.uri);
  return fetchText(sharedUrl(cfg, dirOf(ref.uri) + (index.publicCopy ?? "public.tlock")));
}

function parseIndex(files: Record<string, string>): PackageIndex {
  const idx = JSON.parse(files["index.json"] ?? "null") as PackageIndex;
  if (!idx || !Array.isArray(idx.items)) throw new Error("invalid package index on chain");
  return idx;
}

/** On chain encoding (same as scripts/lib.mjs packageBundleBytes): UTF-8 JSON {"files": {name: text}}, one part. */
export function packageBundleBytes(files: Record<string, string>): Uint8Array {
  const data = toUtf8Bytes(JSON.stringify({ files }));
  // ponytail: one PackageData part per set; split in 64 KiB parts (0, 1, ...) if a set outgrows it.
  if (data.length > MAX_PART) throw new Error(`package bundle is ${data.length} B, above the 64 KiB part limit`);
  return data;
}

/** The PackageData parts of a set, in order, from exactly the recorded blocks (eth_getLogs on one block each,
 *  never a range scan). Throws unless every recorded part is there once. Empty if nothing was posted. */
export async function readChainParts(cfg: AppConfig, examId: string, setIndex: number): Promise<Record<string, string> | null> {
  const c = registry(cfg);
  const recorded = ([...(await c.packageDataBlocks(examId, setIndex))] as bigint[]).map(Number);
  if (recorded.length === 0) return null;
  const parts: { part: number; data: string }[] = [];
  for (const b of new Set(recorded)) {
    for (const l of await c.queryFilter(c.filters.PackageData!(examId, setIndex), b, b)) {
      const args = (l as unknown as { args: { part: bigint; data: string } }).args;
      parts.push({ part: Number(args.part), data: args.data });
    }
  }
  parts.sort((x, y) => x.part - y.part);
  if (parts.length !== recorded.length || parts.some((p, i) => p.part !== i)) {
    throw new Error(`set ${setIndex}: ${parts.length} PackageData parts found, ${recorded.length} recorded`);
  }
  return (JSON.parse(toUtf8String(concat(parts.map((p) => p.data)))) as { files: Record<string, string> }).files;
}

const bundles = new Map<string, Record<string, string>>();

/** A set's files from chain, with every check of scripts/lib.mjs readPackageBundle: root submitted (so the parts are
 *  final), all recorded parts present, each centre file hashing to its leaf, the leaves hashing to the root on chain.
 *  Cached once checked (final by then). */
export async function readChainBundle(cfg: AppConfig, examId: string, setIndex: number): Promise<Record<string, string>> {
  const key = `${cfg.deployment.address}|${examId}|${setIndex}`.toLowerCase();
  const hit = bundles.get(key);
  if (hit) return hit;
  const [root] = await registry(cfg).packageOf(examId, setIndex);
  if (root === ZERO32) throw new Error(`set ${setIndex}: no package root on chain, the data parts are not final`);
  const files = await readChainParts(cfg, examId, setIndex);
  if (!files) throw new Error(`set ${setIndex}: no package data on chain`);
  const index = parseIndex(files);
  const leaves = index.items.map((it) => {
    const leaf = ciphertextLeaf(it.centreId, files[it.file] ?? "");
    if (leaf.toLowerCase() !== it.leaf.toLowerCase()) throw new Error(`set ${setIndex}: ${it.file} does not match its leaf`);
    return leaf;
  });
  if (index.root.toLowerCase() !== String(root).toLowerCase() || merkleRoot(leaves).toLowerCase() !== String(root).toLowerCase()) {
    throw new Error(`set ${setIndex}: package leaves do not hash to the root on chain`);
  }
  bundles.set(key, files);
  return files;
}

/** Trigger a browser download of a text file. */
export function downloadText(name: string, content: string, type = "text/plain"): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
