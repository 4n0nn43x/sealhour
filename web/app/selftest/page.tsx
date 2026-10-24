"use client";
// Hidden browser self test of the seal module bundle (no chain, no relay): local beacon, double lock, base32, render.
import { useEffect, useState } from "react";
import {
  createLocalBeacon,
  decodeSignature,
  drawSet,
  encodeSignature,
  generateCentreKey,
  listRoot,
  openForCentre,
  parseExamSet,
  renderForCentre,
  renderPlain,
  sealForCentre,
  newRc,
} from "@sealhour/seal";
import { Page } from "@/components/Shell";

const SET = JSON.stringify({
  examTitle: "Autotest",
  subject: "Mathématiques",
  setLabel: "Jeu T",
  questions: [
    { id: "q1", text: "Combien font 2 et 3 ?", options: ["5", "6", "4"] },
    { id: "q2", text: "Combien font 4 fois 3 ?", options: ["12", "7", "10"] },
  ],
});

async function selfTest(): Promise<string[]> {
  const out: string[] = [];
  const check = (name: string, ok: boolean) => {
    out.push(`${ok ? "ok" : "FAIL"} ${name}`);
    if (!ok) throw new Error(`self test failed: ${name}`);
  };
  const beacon = createLocalBeacon({ genesisTime: Math.floor(Date.now() / 1000) - 30, period: 1 });
  const client = beacon.client();
  const key = await generateCentreKey();
  const set = parseExamSet(SET);
  const past = beacon.currentRound() - 2;
  const ct = await sealForCentre({ plaintext: SET, recipient: key.recipient, round: past, client });
  const opened = new TextDecoder().decode(await openForCentre({ ciphertext: ct, identity: key.identity, client }));
  check("double lock opens with the centre key after the round", opened === SET);
  const stranger = await generateCentreKey();
  let wrong = "";
  try {
    await openForCentre({ ciphertext: ct, identity: stranger.identity, client });
  } catch (e) {
    wrong = (e as Error).name;
  }
  check("another key is refused (WrongKeyError)", wrong === "WrongKeyError");
  const future = await sealForCentre({ plaintext: SET, recipient: key.recipient, round: beacon.currentRound() + 100, client });
  let early = "";
  try {
    await openForCentre({ ciphertext: future, identity: key.identity, client });
  } catch (e) {
    early = (e as Error).name;
  }
  check("a future round is refused (TooEarlyError)", early === "TooEarlyError");
  const sig = beacon.sign(past);
  check("base32 round trip", decodeSignature(encodeSignature(sig)) === sig.replace(/^0x/, "").toLowerCase());
  check("renderPlain", renderPlain(set).includes("Combien font 2 et 3"));
  check("renderForCentre", renderForCentre(set, "0x" + "11".repeat(32), newRc(), sig).text.length > 0);
  check("drawSet skips burned", drawSet(sig, 3, [0, 1]) === 2);
  check("listRoot", /^0x[0-9a-f]{64}$/.test(listRoot(["0x" + "11".repeat(32)])));
  return out;
}

export default function SelfTest() {
  const [lines, setLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"running" | "PASS" | "FAIL">("running");
  useEffect(() => {
    let alive = true;
    selfTest()
      .then((l) => alive && (setLines(l), setStatus("PASS")))
      .catch((e: unknown) => alive && (setLines([String((e as Error)?.message ?? e)]), setStatus("FAIL")));
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Page title="Self test" needsConfig={false}>
      <p data-testid="selftest" className={status === "FAIL" ? "bad" : undefined}>
        {status}
      </p>
      <pre className="code">{lines.join("\n")}</pre>
    </Page>
  );
}
