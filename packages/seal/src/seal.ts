// Double lock: tlock(round, age(centre X25519 key, plaintext)). Also r_c commitments.
import { timelockEncrypt, timelockDecrypt, Buffer } from "tlock-js";
import type { ChainClient } from "tlock-js";
import { Encrypter, Decrypter } from "age-encryption";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/hashes/utils";
import { BadSignatureError, TooEarlyError, WrongKeyError } from "./errors.js";
import { roundTime, verifyBeaconSignature, type Beacon } from "./beacon.js";
import { serializeExamSet, type ExamSet } from "./exam.js";
import { merkleRoot, packageLeaf } from "./merkle.js";
import { bytesToHex, hexToBytes, to0x, toBytes32, utf8 } from "./util.js";

const ARMOR_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
const ARMOR_FOOTER = "-----END AGE ENCRYPTED FILE-----";

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Read the tlock stanza ("-> tlock <round> <chainHash>") of an armored tlock ciphertext. */
export function tlockHeader(ciphertext: string): { round: number; chainHash: string } {
  const t = ciphertext.trim();
  if (!t.startsWith(ARMOR_HEADER) || !t.endsWith(ARMOR_FOOTER)) throw new Error("not an armored tlock ciphertext");
  const bytes = base64ToBytes(t.slice(ARMOR_HEADER.length, t.length - ARMOR_FOOTER.length).replace(/\s+/g, ""));
  // The header is ASCII; read it up to the MAC line.
  let header = "";
  for (let i = 0; i < bytes.length && i < 4096; i++) header += String.fromCharCode(bytes[i]!);
  const m = /\n-> tlock (\d+) ([0-9a-fA-F]+)\n/.exec(header);
  if (!m) throw new Error("ciphertext has no tlock stanza");
  return { round: Number.parseInt(m[1]!, 10), chainHash: m[2]!.toLowerCase() };
}

/**
 * Wrap a client so every beacon it returns is verified against the chain public key.
 * Refusals for future rounds become TooEarlyError, invalid signatures BadSignatureError.
 */
function verifyingClient(client: ChainClient): ChainClient {
  const info = () => client.chain().info();
  const check = async (fetch: () => Promise<unknown>, expected?: number): Promise<Beacon> => {
    let b: Beacon;
    try {
      b = (await fetch()) as Beacon;
    } catch (e) {
      if (e instanceof TooEarlyError || e instanceof BadSignatureError) throw e;
      const msg = String((e as Error)?.message ?? e);
      if (/\b425\b|too early|future|not emitted/i.test(msg)) throw new TooEarlyError(msg, expected);
      throw e;
    }
    const round = Number(b?.round);
    if (expected !== undefined && round !== expected) throw new BadSignatureError(`beacon for round ${round} served instead of ${expected}`);
    const signature = String(b?.signature ?? "");
    if (!verifyBeaconSignature(await info(), round, signature)) throw new BadSignatureError(`beacon signature for round ${round} does not verify`);
    return { round, signature, randomness: bytesToHex(sha256(hexToBytes(signature))) };
  };
  const wrapped = {
    options: { ...client.options, disableBeaconVerification: false },
    chain: () => client.chain(),
    get: (r: number) => check(() => client.get(r), r),
    latest: () => check(() => client.latest()),
  };
  return wrapped as unknown as ChainClient;
}

/** age encrypt to the centre recipient, then tlock to the round. Returns the armored ciphertext. */
export async function sealForCentre(p: { plaintext: Uint8Array | string; recipient: string; round: number; client: ChainClient }): Promise<string> {
  if (!Number.isInteger(p.round) || p.round < 1) throw new RangeError("round must be an integer >= 1");
  const e = new Encrypter();
  e.addRecipient(p.recipient.trim());
  const inner = await e.encrypt(p.plaintext);
  return timelockEncrypt(p.round, Buffer.from(inner), p.client);
}

/**
 * Open a sealed package: tlock layer with the round signature (verified), then age layer with the
 * centre identity. Errors: TooEarlyError, BadSignatureError, WrongKeyError.
 */
export async function openForCentre(p: { ciphertext: string; identity: string; client: ChainClient }): Promise<Uint8Array> {
  const { round, chainHash } = tlockHeader(p.ciphertext);
  const info = await p.client.chain().info();
  if (chainHash !== String(info.hash).toLowerCase()) {
    throw new BadSignatureError(`ciphertext is locked on chain ${chainHash}, client serves chain ${info.hash}`);
  }
  if (roundTime(info, round) > Date.now()) throw new TooEarlyError(`too early: decryptable at round ${round}`, round);
  let inner: Uint8Array;
  try {
    inner = await timelockDecrypt(p.ciphertext, verifyingClient(p.client));
  } catch (e) {
    if (e instanceof TooEarlyError || e instanceof BadSignatureError) throw e;
    const msg = String((e as Error)?.message ?? e);
    if (/too early/i.test(msg)) throw new TooEarlyError(msg, round);
    if (/invalid proof|not valid/i.test(msg)) throw new BadSignatureError(msg);
    throw e;
  }
  const d = new Decrypter();
  try {
    d.addIdentity(p.identity.trim());
  } catch (e) {
    throw new WrongKeyError(`invalid centre identity: ${(e as Error).message}`);
  }
  try {
    return await d.decrypt(new Uint8Array(inner));
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (/no identity matched/i.test(msg)) throw new WrongKeyError("this key is not the one the package was sealed to");
    throw e;
  }
}

/** Seal one exam set for every centre of the frozen list; leaves and root as stored on chain. */
export async function sealPackage(p: {
  set: ExamSet;
  centres: { centreId: string; recipient: string }[];
  round: number;
  client: ChainClient;
}): Promise<{ items: { centreId: string; ciphertext: string; leaf: string }[]; root: string }> {
  if (p.centres.length === 0) throw new Error("sealPackage: no centres");
  const ids = p.centres.map((c) => toBytes32(c.centreId));
  if (new Set(ids).size !== ids.length) throw new Error("sealPackage: duplicate centreId");
  const plaintext = serializeExamSet(p.set);
  const items: { centreId: string; ciphertext: string; leaf: string }[] = [];
  for (let i = 0; i < p.centres.length; i++) {
    const ciphertext = await sealForCentre({ plaintext, recipient: p.centres[i]!.recipient, round: p.round, client: p.client });
    const leaf = packageLeaf(ids[i]!, to0x(sha256(utf8(ciphertext))));
    items.push({ centreId: ids[i]!, ciphertext, leaf });
  }
  return { items, root: merkleRoot(items.map((it) => it.leaf)) };
}

/** Fresh random r_c (32 bytes, 0x prefixed hex). */
export function newRc(): string {
  return to0x(randomBytes(32));
}

/** Commitment H(r_c) = 0x sha256(r_c bytes). */
export function commitRc(rcHex: string): string {
  return to0x(sha256(hexToBytes(toBytes32(rcHex))));
}

/** tlock(revealRound, r_c bytes): armored string, stored on chain as utf8 bytes. */
export async function tlockRc(rcHex: string, revealRound: number, client: ChainClient): Promise<string> {
  return timelockEncrypt(revealRound, Buffer.from(hexToBytes(toBytes32(rcHex))), client);
}

/** Open a tlocked r_c after the reveal round (verified beacon). Returns 0x hex; compare commitRc to the on chain commitment. */
export async function openRc(p: { tlocked: string; client: ChainClient }): Promise<string> {
  const { round, chainHash } = tlockHeader(p.tlocked);
  const info = await p.client.chain().info();
  if (chainHash !== String(info.hash).toLowerCase()) throw new BadSignatureError(`r_c is locked on chain ${chainHash}, client serves ${info.hash}`);
  if (roundTime(info, round) > Date.now()) throw new TooEarlyError(`too early: r_c revealed at round ${round}`, round);
  const out = await timelockDecrypt(p.tlocked, verifyingClient(p.client));
  return to0x(new Uint8Array(out));
}

/** Public copy of a set: tlock(revealRound, utf8 text), no centre key. Anyone opens it after the reveal round. */
export async function tlockText(text: string, round: number, client: ChainClient): Promise<string> {
  return timelockEncrypt(round, Buffer.from(new TextEncoder().encode(text)), client);
}

/** Open a public tlocked text after its round (verified beacon, same checks as openRc). */
export async function openText(p: { tlocked: string; client: ChainClient }): Promise<string> {
  const { round, chainHash } = tlockHeader(p.tlocked);
  const info = await p.client.chain().info();
  if (chainHash !== String(info.hash).toLowerCase()) throw new BadSignatureError(`text is locked on chain ${chainHash}, client serves ${info.hash}`);
  if (roundTime(info, round) > Date.now()) throw new TooEarlyError(`too early: text revealed at round ${round}`, round);
  const out = await timelockDecrypt(p.tlocked, verifyingClient(p.client));
  return new TextDecoder().decode(new Uint8Array(out));
}
