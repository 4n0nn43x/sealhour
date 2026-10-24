#!/usr/bin/env node
// End to end replay of the SealHour final demo (docs/smu/32, section 9) against the running Hardhat
// node and local beacon relay, after seed-demo.mjs. Prints numbered steps with OK or FAIL;
// exits 1 if any check fails.
// Usage: node demo-cli.mjs
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import {
  BadSignatureError,
  TooEarlyError,
  WrongKeyError,
  attributeLeak,
  commitRc,
  decodeSignature,
  drawSet,
  encodeSignature,
  generateCentreKey,
  httpBeaconClient,
  merkleProof,
  offlineClient,
  openForCentre,
  openRc,
  openText,
  parseExamSet,
  recipientToBytes32,
  recordCopyIndexes,
  renderForCentre,
  renderPlain,
  roundTime,
  serializeExamSet,
  verifyBeaconSignature,
  verifyProof,
} from "@sealhour/seal";
import { FILES, SHARED_DIR, ensureWallClockMining, loadDeployment, readBeaconPin, readJson, revertName, silenceTlockLogs, sleep } from "./lib.mjs";

silenceTlockLogs();

const COPIES_PER_CENTRE = 580; // average exam centre (docs/smu/32, section 3)
let stepNo = 0;
let failures = 0;
let checks = 0;

function step(title) {
  stepNo++;
  console.log(`\n${stepNo}. ${title}`);
}
function info(msg) {
  console.log(`     ${msg}`);
}
/** Run one check: fn returns a detail string (printed) or throws. */
async function check(label, fn) {
  checks++;
  try {
    const detail = await fn();
    console.log(`   OK    ${label}${detail ? `: ${detail}` : ""}`);
    return true;
  } catch (e) {
    failures++;
    console.log(`   FAIL  ${label}: ${e?.shortMessage ?? e?.message ?? e}`);
    return false;
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
/** The promise must reject with a typed seal error of the given class. */
async function expectError(promiseFn, ErrorClass) {
  try {
    await promiseFn();
  } catch (e) {
    if (e instanceof ErrorClass) return `refused (${ErrorClass.name})`;
    throw new Error(`expected ${ErrorClass.name}, got ${e?.name ?? "error"}: ${e?.message ?? e}`);
  }
  throw new Error(`expected ${ErrorClass.name}, but opening succeeded`);
}
/** The transaction must be refused by the contract with the given custom error. */
async function expectRevert(sendFn, iface, errorName) {
  try {
    const tx = await sendFn();
    await tx.wait();
  } catch (e) {
    const name = revertName(e, iface);
    if (name === errorName) return `transaction refused by the contract (${errorName})`;
    throw new Error(`expected revert ${errorName}, got ${name ?? e?.shortMessage ?? e?.message ?? e}`);
  }
  throw new Error(`expected revert ${errorName}, but the transaction went through`);
}

async function main() {
  const state = readJson(FILES.demoState);
  const deployment = loadDeployment();
  const beaconInfo = readJson(FILES.beaconInfo); // shipped with the accreditation letter, before the exam
  const provider = new ethers.JsonRpcProvider(state.rpcUrl, undefined, { pollingInterval: 250 });
  await ensureWallClockMining(provider);
  const office = state.office.privateKey ? new ethers.Wallet(state.office.privateKey, provider) : await provider.getSigner(0);
  const registry = new ethers.Contract(state.contract, deployment.abi, office);
  const iface = registry.interface;
  const as = (privateKey) => registry.connect(new ethers.Wallet(privateKey, provider));
  // The relay and the beacon info shipped with the letter must match the pin stored in the contract.
  const pin = await readBeaconPin(registry, deployment);
  if (beaconInfo.hash !== pin.chainHash || beaconInfo.public_key !== pin.publicKey) throw new Error("beacon-info.json differs from the beacon pin stored in the contract");
  const relay = httpBeaconClient(state.beaconUrl, pin);
  const { examId, rounds } = state;
  const T = roundTime(beaconInfo, rounds.open);
  const revealT = roundTime(beaconInfo, rounds.reveal);
  const byName = Object.fromEntries(state.centres.map((c) => [c.name, c]));
  const northgate = byName["Northgate"];
  const riverside = byName["Riverside"];
  const hillcrest = byName["Hillcrest"];
  const committeeC = state.committees.find((k) => k.label === "C");
  const committeeD = state.committees.find((k) => k.label === "D");
  const exam = await registry.getExam(examId);
  const setCount = Number(exam.setCount);
  const labelOf = (i) => (i === setCount ? state.reserveCommittee.label : state.committees[i].label);

  /** Fetch the package file of a centre for a set via its on chain URI, and check it against the on chain root. */
  async function fetchPackage(setIndex, centreId) {
    assert(Number.isInteger(setIndex), "no set drawn (previous step failed)");
    const [root, uri] = await registry.packageOf(examId, setIndex);
    const indexFile = path.join(SHARED_DIR, uri);
    const index = readJson(indexFile);
    const pos = index.items.findIndex((it) => it.centreId === centreId);
    assert(pos >= 0, `centre missing from package ${index.label}`);
    const ciphertext = fs.readFileSync(path.join(path.dirname(indexFile), index.items[pos].file), "utf8");
    const leaves = index.items.map((it) => it.leaf);
    const digest = ethers.sha256(ethers.toUtf8Bytes(ciphertext));
    const leaf = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [centreId, digest]));
    assert(leaf === leaves[pos], "file does not match its leaf");
    assert(verifyProof(leaf, merkleProof(leaves, pos), root), "invalid Merkle proof against the on-chain root");
    return { ciphertext, index, dir: path.dirname(indexFile) };
  }

  console.log(`SealHour, end to end demo: ${state.examTitle}`);
  console.log(`Contract ${state.contract} on ${state.rpcUrl}, beacon relay ${state.beaconUrl}`);
  console.log(`Rounds: open ${rounds.open}, reveal ${rounds.reveal}, reserve ${rounds.reserveOpen} then ${rounds.reserveReveal}`);
  console.log(`Opening (T) in ${Math.round((T - Date.now()) / 1000)} s`);

  // a. Before T
  step("Before T: a juror downloads the Northgate package (set A) and tries to open it");
  const jury = await generateCentreKey(); // the jury's own key, not a centre key
  let northgateA;
  await check("package fetched, integrity checked against the Merkle root published on chain", async () => {
    northgateA = await fetchPackage(0, northgate.centreId);
    return `${northgateA.ciphertext.length} bytes`;
  });
  await check("the relay refuses to serve the opening round signature", async () => {
    const res = await fetch(`${state.beaconUrl}/public/${rounds.open}`);
    assert(res.status === 425, `HTTP ${res.status} instead of 425`);
    return `HTTP 425, no key exists before T`;
  });
  await check("the juror (no centre key) cannot open", () =>
    expectError(() => openForCentre({ ciphertext: northgateA.ciphertext, identity: jury.identity, client: relay }), TooEarlyError),
  );
  await check("Northgate, with its own key, cannot open before T either", () =>
    expectError(() => openForCentre({ ciphertext: northgateA.ciphertext, identity: northgate.identity, client: relay }), TooEarlyError),
  );

  // b. Phantom centre
  step(`The office tries to add a fifth centre ("${state.phantom.name}") to the frozen list`);
  const listed = await registry.examCentres(examId);
  await check("freezing the list again with 5 centres", () => {
    const ids = [...listed, state.phantom.centreId];
    const root = ethers.keccak256(ethers.solidityPacked(["bytes32[]"], [ids]));
    return expectRevert(() => registry.freezeCentres(examId, ids, root, ids.length), iface, "AlreadyDone");
  });
  await check("replacing the Northgate key with the phantom centre's key", async () => {
    const ghost = await generateCentreKey();
    return expectRevert(() => registry.registerCentre(northgate.centreId, recipientToBytes32(ghost.recipient), state.office.address, state.phantom.name), iface, "KeyFrozen");
  });
  await check("enrolling the phantom centre in the exam", () =>
    expectRevert(() => registry.joinExam(examId, state.phantom.centreId, ethers.ZeroHash, "0x"), iface, "NotCentre"),
  );
  await check("the public list still has the announced number of centres", async () => {
    const now = await registry.examCentres(examId);
    assert(now.length === state.announcedCentreCount, `${now.length} centres, ${state.announcedCentreCount} announced`);
    return `${now.length} centres: ${state.centres.map((c) => c.name).join(", ")}`;
  });

  // c. Burn
  step("Committee C saw its set circulating on Telegram the day before: it burns it before T");
  await check("committee D tries to burn set C", () => expectRevert(() => as(committeeD.privateKey).burnSet(examId, 2), iface, "NotCommittee"));
  await check("committee C burns its set on chain", async () => {
    const rc = await (await as(committeeC.privateKey).burnSet(examId, 2)).wait();
    const ev = rc.logs.map((l) => iface.parseLog(l)).find((l) => l?.name === "SetBurned");
    assert(ev, "no SetBurned event");
    assert(await registry.isBurned(examId, 2), "isBurned(C) is false");
    return `block ${rc.blockNumber}, SetBurned event`;
  });

  // d. Wait for T
  step(`Waiting for opening round ${rounds.open}`);
  await waitRound(rounds.open, "opening");
  await check("opening round reached on the beacon and on chain", async () => `chain round ${await registry.currentRound()}`);

  // e. Signature from the relay
  step("The round falls: signature fetched from the relay, verified locally");
  let sig;
  await check("opening round signature valid for the beacon public key", async () => {
    const res = await fetch(`${state.beaconUrl}/public/${rounds.open}`);
    assert(res.ok, `HTTP ${res.status}`);
    const b = await res.json();
    assert(b.round === rounds.open, `round ${b.round}`);
    assert(verifyBeaconSignature(beaconInfo, rounds.open, b.signature), "invalid signature");
    sig = b.signature;
    return `${sig.slice(0, 24)}... (48 bytes)`;
  });
  await check("a tampered signature is rejected", async () => {
    const bad = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    assert(!verifyBeaconSignature(beaconInfo, rounds.open, bad), "tampered signature accepted");
    return "rejected";
  });
  await check('juror\'s phone: "valid signature, you are not a centre"', () =>
    expectError(() => openForCentre({ ciphertext: northgateA.ciphertext, identity: jury.identity, client: relay }), WrongKeyError),
  );

  // f. Hillcrest offline
  step("Hillcrest, offline, receives the signature by SMS and opens its package");
  let drawn;
  let hillSet;
  let sms;
  await check("signature encoded in Crockford base32 (with check) for the SMS", async () => {
    sms = encodeSignature(sig);
    return `${sms.length} characters`;
  });
  if (sms) info(`SMS: ${sms}`);
  let offline;
  await check("the centre head retypes the code (lowercase, spaces): decoded and verified offline", async () => {
    const typed = sms.toLowerCase().replace(/-/g, " ");
    const decoded = decodeSignature(typed);
    assert(decoded.replace(/^0x/, "") === sig.replace(/^0x/, ""), "decoded signature differs");
    offline = offlineClient(beaconInfo, rounds.open, decoded);
    return "offlineClient ready, no network needed";
  });
  await check("a corrupted SMS code is refused", async () => {
    const corrupted = (sms[0] === "0" ? "1" : "0") + sms.slice(1);
    try {
      offlineClient(beaconInfo, rounds.open, decodeSignature(corrupted));
    } catch (e) {
      return `refused (${e instanceof BadSignatureError ? "BadSignatureError" : "base32 check"})`;
    }
    throw new Error("corrupted code accepted");
  });
  await check("drawing the set among the unburned sets (C burned)", async () => {
    const burned = [];
    for (let i = 0; i < setCount; i++) if (await registry.isBurned(examId, i)) burned.push(i);
    assert(burned.length === 1 && burned[0] === 2, `sets burned on chain: [${burned}]`);
    const submitted = [];
    for (let i = 0; i < setCount; i++) if ((await registry.packageOf(examId, i))[0] !== ethers.ZeroHash) submitted.push(i);
    drawn = drawSet(sig, setCount, burned, submitted);
    assert(drawn !== 2, "burned set C was drawn");
    return `burned sets [${burned.map(labelOf)}], drawn set: ${labelOf(drawn)}`;
  });
  let hillRender;
  await check(`Hillcrest opens the drawn set with its key`, async () => {
    const pkg = await fetchPackage(drawn, hillcrest.centreId);
    const plain = await openForCentre({ ciphertext: pkg.ciphertext, identity: hillcrest.identity, client: offline });
    hillSet = parseExamSet(new TextDecoder().decode(plain));
    assert(hillSet.setLabel === `Set ${labelOf(drawn)}`, `opened set ${hillSet.setLabel}`);
    hillRender = renderForCentre(hillSet, hillcrest.centreId, hillcrest.rcHex, sig);
    return `${hillSet.setLabel}, ${hillSet.questions.length} questions`;
  });
  if (hillRender) {
    // The first 3 lines are the header; show them and the first printed question with its options.
    const lines = hillRender.text.split("\n");
    const firstQuestionEnd = lines.findIndex((l, i) => i > 3 && /^\d+\. /.test(l));
    info("Hillcrest fingerprinted rendering (header and first printed question):");
    for (const line of lines.slice(0, firstQuestionEnd > 0 ? firstQuestionEnd : 3)) info(`  | ${line}`);
    info(`  | ... question order [${hillRender.order.map((q) => q + 1).join(", ")}], marks ${hillRender.marks.slice(0, 23)}...`);
  }
  await check(`record copies designated by the signature (out of ${COPIES_PER_CENTRE})`, async () => {
    const idx = recordCopyIndexes(sig, COPIES_PER_CENTRE);
    assert(idx.length === 3, `${idx.length} copies`);
    return `copies no. ${idx.join(", ")} of the printed stack`;
  });

  // g. Every centre
  step("Each centre opens its copy of the drawn set (online relay)");
  const renders = new Map();
  for (const c of state.centres) {
    await check(`${c.name}`, async () => {
      const pkg = await fetchPackage(drawn, c.centreId);
      const set = parseExamSet(new TextDecoder().decode(await openForCentre({ ciphertext: pkg.ciphertext, identity: c.identity, client: relay })));
      assert(serializeExamSet(set) === serializeExamSet(readJson(path.join(FILES.setsDir, `set-${drawn}.json`))), "content differs from the committee draft");
      const r = renderForCentre(set, c.centreId, c.rcHex, sig);
      renders.set(c.centreId, r.text);
      return `${set.setLabel} opened, fingerprint ${r.marks.slice(0, 11)}...`;
    });
  }
  await check("the four printed renderings all differ (per centre fingerprint)", async () => {
    assert(new Set(renders.values()).size === state.centres.length, "two centres have the same rendering");
    return "4 distinct renderings";
  });
  await check("reserve set R stays closed until its own round", async () => {
    const pkg = await fetchPackage(setCount, northgate.centreId);
    return expectError(() => openForCentre({ ciphertext: pkg.ciphertext, identity: northgate.identity, client: relay }), TooEarlyError);
  });

  // h. Reveal
  step(`Waiting for reveal round ${rounds.reveal}`);
  await waitRound(rounds.reveal, "reveal");
  step("After the reveal: the sets and every r_c open publicly");
  const publicSets = [];
  for (let i = 0; i < setCount; i++) {
    await check(`public copy of set ${labelOf(i)}`, async () => {
      const [, uri] = await registry.packageOf(examId, i);
      const dir = path.dirname(path.join(SHARED_DIR, uri));
      const index = readJson(path.join(SHARED_DIR, uri));
      const text = await openText({ tlocked: fs.readFileSync(path.join(dir, index.publicCopy), "utf8"), client: relay });
      const set = parseExamSet(text);
      assert(serializeExamSet(set) === serializeExamSet(readJson(path.join(FILES.setsDir, `set-${i}.json`))), "public copy differs from the sealed set");
      publicSets.push({ setIndex: i, set });
      return `${set.setLabel} readable by anyone${i === 2 ? " (burned set)" : ""}${i === drawn ? " (drawn set)" : ""}`;
    });
  }
  await check("the public copy of reserve set R waits for its own reveal", async () => {
    const [, uri] = await registry.packageOf(examId, setCount);
    const index = readJson(path.join(SHARED_DIR, uri));
    const tlocked = fs.readFileSync(path.join(SHARED_DIR, path.dirname(uri), index.publicCopy), "utf8");
    return expectError(() => openText({ tlocked, client: relay }), TooEarlyError);
  });
  const revealedRc = [];
  for (const c of state.centres) {
    await check(`r_c of ${c.name} opened from the chain, matches its commitment`, async () => {
      const part = await registry.participation(examId, c.centreId);
      const rc = await openRc({ tlocked: ethers.toUtf8String(part.tlockedRc), client: relay });
      assert(commitRc(rc) === part.rcCommit, "H(r_c) differs from the published commitment");
      assert(rc === c.rcHex, "r_c differs from the centre's");
      revealedRc.push({ centreId: c.centreId, rcHex: rc });
      return `${rc.slice(0, 18)}...`;
    });
  }

  // i. Verifier, with public data only (public copies, r_c opened from the chain, the signature)
  step("Dated verifier (public data only)");
  const base = { openRoundTimeMs: T, revealRoundTimeMs: revealT, sets: publicSets, drawnSet: drawn, signatureHex: sig, centres: revealedRc };
  // Seen between T and the reveal round: after reveal every rendering is computable by anyone.
  const inCentreWindow = T + Math.floor((revealT - T) / 2);
  const nameOf = (id) => state.centres.find((c) => c.centreId === id)?.name ?? id;
  const photo = renders.get(riverside.centreId);
  await check("photo of a Riverside copy (centre 2) seen after T, before the reveal", async () => {
    const v = attributeLeak({ ...base, leakedText: photo, seenAtMs: inCentreWindow });
    assert(v.verdict === "centre" && v.centreId === riverside.centreId, `verdict ${v.verdict} ${v.centreId ? nameOf(v.centreId) : ""}`);
    return `verdict "centre": ${nameOf(v.centreId)} (score ${v.score.toFixed(2)})`;
  });
  await check("text of set C seen on Telegram the day before (before T)", async () => {
    const leak = renderPlain(publicSets.find((s) => s.setIndex === 2).set);
    const v = attributeLeak({ ...base, leakedText: leak, seenAtMs: T - 24 * 3600_000 });
    assert(v.verdict === "committee" && v.setIndex === 2, `verdict ${v.verdict} ${v.setIndex ?? ""}`);
    return `verdict "committee": ${labelOf(v.setIndex)} (score ${v.score.toFixed(2)})`;
  });
  await check("drawn set text retyped in canonical order, seen after T", async () => {
    const leak = renderPlain(publicSets.find((s) => s.setIndex === drawn).set);
    const v = attributeLeak({ ...base, leakedText: leak, seenAtMs: inCentreWindow });
    assert(v.verdict === "unattributed", `verdict ${v.verdict}`);
    return `verdict "unattributed" (leak in the centre window, committee ${labelOf(drawn)} is not accused)`;
  });
  await check("unrelated rumour", async () => {
    const rumour = "The maths paper will be on solid geometry and probability, my cousin in Riverside saw it last night.";
    const v = attributeLeak({ ...base, leakedText: rumour, seenAtMs: T + 60_000 });
    assert(v.verdict === "no-match", `verdict ${v.verdict}`);
    return `verdict "no match" (score ${v.score.toFixed(2)})`;
  });

  // j. Flag
  step("Public flag of Riverside with the evidence (after the reveal)");
  await check("flagCentre(Riverside) accepted on chain", async () => {
    const evidence = ethers.keccak256(ethers.toUtf8Bytes(photo));
    const rc = await (await registry.flagCentre(examId, riverside.centreId, evidence)).wait();
    const ev = rc.logs.map((l) => iface.parseLog(l)).find((l) => l?.name === "CentreFlagged");
    assert(ev && ev.args.centreId === riverside.centreId && ev.args.evidenceHash === evidence, "CentreFlagged event missing or wrong");
    return `CentreFlagged event, evidence ${evidence.slice(0, 18)}...`;
  });

  console.log(`\n${failures === 0 ? "RESULT: OK" : "RESULT: FAIL"} (${checks - failures}/${checks} checks passed)`);
  return failures === 0 ? 0 : 1;

  /** Wait until the beacon has emitted the round and a block of that round is mined. */
  async function waitRound(round, what) {
    const target = roundTime(beaconInfo, round);
    let lastPrint = 0;
    for (;;) {
      const left = target - Date.now();
      if (left <= 0) {
        const res = await fetch(`${state.beaconUrl}/public/${round}`);
        if (res.ok && Number(await registry.currentRound()) >= round) return;
      } else if (Date.now() - lastPrint >= 10_000) {
        info(`${what} in ${Math.ceil(left / 1000)} s`);
        lastPrint = Date.now();
      }
      await sleep(Math.min(Math.max(left, 200), 1000));
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.log(`\nFAIL  unexpected error: ${e?.stack ?? e}`);
    process.exit(1);
  });
