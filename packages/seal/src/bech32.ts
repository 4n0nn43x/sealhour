// Minimal BIP 173 bech32 (not bech32m), as used by age for "age1..." recipients.
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk >>> 0;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

function convertBits(data: ArrayLike<number>, from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const maxv = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (v < 0 || v >> from !== 0) throw new Error("bech32: invalid value");
    acc = (acc << from) | v;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & maxv);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv);
  } else if (bits >= from || ((acc << (to - bits)) & maxv) !== 0) {
    throw new Error("bech32: invalid padding");
  }
  return out;
}

export function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const data = convertBits(bytes, 8, 5, true);
  const values = [...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >>> (5 * (5 - i))) & 31);
  return hrp + "1" + [...data, ...checksum].map((d) => CHARSET[d]).join("");
}

export function bech32Decode(str: string): { hrp: string; bytes: Uint8Array } {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) throw new Error("bech32: mixed case");
  const s = str.toLowerCase();
  const pos = s.lastIndexOf("1");
  if (pos < 1 || pos + 7 > s.length) throw new Error("bech32: missing separator or checksum");
  const hrp = s.slice(0, pos);
  const data: number[] = [];
  for (const ch of s.slice(pos + 1)) {
    const d = CHARSET.indexOf(ch);
    if (d < 0) throw new Error(`bech32: invalid character ${ch}`);
    data.push(d);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error("bech32: bad checksum");
  return { hrp, bytes: Uint8Array.from(convertBits(data.slice(0, -6), 5, 8, false)) };
}
