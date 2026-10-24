// Sealed package files (plan B of IPFS: static files, integrity by the Merkle root on chain).
import { merkleRoot, packageLeaf } from "@sealhour/seal";
import { sha256, toUtf8Bytes } from "ethers";
import { fetchJson, fetchText, sharedUrl, type AppConfig } from "./config";

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
export async function fetchCentreCiphertext(cfg: AppConfig, uri: string, centreId: string, chainRoot: string): Promise<FetchedCiphertext> {
  const index = await fetchPackageIndex(cfg, uri);
  const item = index.items.find((it) => it.centreId.toLowerCase() === centreId.toLowerCase());
  if (!item) throw new Error("CentreNotInPackage");
  const rel = dirOf(uri) + item.file;
  const url = sharedUrl(cfg, rel);
  const ciphertext = await fetchText(url);
  const leafOk = ciphertextLeaf(item.centreId, ciphertext).toLowerCase() === item.leaf.toLowerCase();
  const rootOk = merkleRoot(index.items.map((it) => it.leaf)).toLowerCase() === chainRoot.toLowerCase();
  return { index, file: item.file, url, ciphertext, leafOk, rootOk };
}

export async function fetchPublicCopy(cfg: AppConfig, uri: string): Promise<string> {
  const index = await fetchPackageIndex(cfg, uri);
  return fetchText(sharedUrl(cfg, dirOf(uri) + (index.publicCopy ?? "public.tlock")));
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
