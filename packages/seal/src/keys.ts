// Centre key pairs: age X25519 identities, and their lossless bytes32 form stored on chain.
import { generateX25519Identity, identityToRecipient } from "age-encryption";
import { bech32Decode, bech32Encode } from "./bech32.js";
import { hexToBytes, to0x, toBytes32 } from "./util.js";

/** New X25519 age key pair for a centre. The identity never leaves the centre. */
export async function generateCentreKey(): Promise<{ identity: string; recipient: string }> {
  const identity = await generateX25519Identity();
  const recipient = await identityToRecipient(identity);
  return { identity, recipient };
}

/** "age1..." X25519 recipient to the 0x prefixed 32 byte public key. */
export function recipientToBytes32(recipient: string): string {
  const { hrp, bytes } = bech32Decode(recipient.trim());
  if (hrp !== "age") throw new Error(`not an age X25519 recipient (prefix ${hrp})`);
  if (bytes.length !== 32) throw new Error(`age X25519 recipient must hold 32 bytes, got ${bytes.length}`);
  return to0x(bytes);
}

/** 0x prefixed 32 byte public key to its "age1..." recipient. */
export function bytes32ToRecipient(hex: string): string {
  return bech32Encode("age", hexToBytes(toBytes32(hex)));
}
