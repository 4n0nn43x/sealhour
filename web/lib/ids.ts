// Identifiers typed by people: a bytes32 hex is taken as is, any other text is hashed (keccak256).
import { id as keccakText, isHexString } from "ethers";

export function toBytes32Id(input: string): string {
  const s = input.trim();
  if (isHexString(s, 32)) return s.toLowerCase();
  return keccakText(s);
}

export function splitList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
