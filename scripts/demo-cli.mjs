#!/usr/bin/env node
// End to end replay of the SealHour final demo (docs/smu/32, section 9) against the running Hardhat
// node and local beacon relay, after seed-demo.mjs. Prints numbered steps in French with OK or FAIL;
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

const COPIES_PER_CENTRE = 580; // average BEPC centre (docs/smu/32, section 3)
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
    console.log(`   OK    ${label}${detail ? ` : ${detail}` : ""}`);
    return true;
  } catch (e) {
    failures++;
    console.log(`   FAIL  ${label} : ${e?.shortMessage ?? e?.message ?? e}`);
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
    if (e instanceof ErrorClass) return `refusé (${ErrorClass.name})`;
    throw new Error(`attendu ${ErrorClass.name}, obtenu ${e?.name ?? "erreur"} : ${e?.message ?? e}`);
  }
  throw new Error(`attendu ${ErrorClass.name}, mais l'ouverture a réussi`);
}
/** The transaction must be refused by the contract with the given custom error. */
async function expectRevert(sendFn, iface, errorName) {
  try {
    const tx = await sendFn();
    await tx.wait();
  } catch (e) {
    const name = revertName(e, iface);
    if (name === errorName) return `transaction refusée par le contrat (${errorName})`;
    throw new Error(`attendu le revert ${errorName}, obtenu ${name ?? e?.shortMessage ?? e?.message ?? e}`);
  }
  throw new Error(`attendu le revert ${errorName}, mais la transaction est passée`);
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
  const cotonou = byName["Cotonou"];
  const parakou = byName["Parakou"];
  const natitingou = byName["Natitingou"];
  const committeeC = state.committees.find((k) => k.label === "C");
  const committeeD = state.committees.find((k) => k.label === "D");
  const exam = await registry.getExam(examId);
  const setCount = Number(exam.setCount);
  const labelOf = (i) => (i === setCount ? state.reserveCommittee.label : state.committees[i].label);

  /** Fetch the package file of a centre for a set via its on chain URI, and check it against the on chain root. */
  async function fetchPackage(setIndex, centreId) {
    assert(Number.isInteger(setIndex), "aucun jeu tiré (étape précédente en échec)");
    const [root, uri] = await registry.packageOf(examId, setIndex);
    const indexFile = path.join(SHARED_DIR, uri);
    const index = readJson(indexFile);
    const pos = index.items.findIndex((it) => it.centreId === centreId);
    assert(pos >= 0, `centre absent du paquet ${index.label}`);
    const ciphertext = fs.readFileSync(path.join(path.dirname(indexFile), index.items[pos].file), "utf8");
    const leaves = index.items.map((it) => it.leaf);
    const digest = ethers.sha256(ethers.toUtf8Bytes(ciphertext));
    const leaf = ethers.keccak256(ethers.solidityPacked(["bytes32", "bytes32"], [centreId, digest]));
    assert(leaf === leaves[pos], "le fichier ne correspond pas à sa feuille");
    assert(verifyProof(leaf, merkleProof(leaves, pos), root), "preuve de Merkle invalide contre la racine sur la chaîne");
    return { ciphertext, index, dir: path.dirname(indexFile) };
  }

  console.log(`SealHour, démo de bout en bout : ${state.examTitle}`);
  console.log(`Contrat ${state.contract} sur ${state.rpcUrl}, relais beacon ${state.beaconUrl}`);
  console.log(`Rounds : ouverture ${rounds.open}, révélation ${rounds.reveal}, réserve ${rounds.reserveOpen} puis ${rounds.reserveReveal}`);
  console.log(`Ouverture (T) dans ${Math.round((T - Date.now()) / 1000)} s`);

  // a. Before T
  step("Avant T : un juré télécharge le paquet de Cotonou (jeu A) et tente de l'ouvrir");
  const jury = await generateCentreKey(); // the jury's own key, not a centre key
  let cotonouA;
  await check("paquet récupéré, intégrité vérifiée contre la racine de Merkle publiée sur la chaîne", async () => {
    cotonouA = await fetchPackage(0, cotonou.centreId);
    return `${cotonouA.ciphertext.length} octets`;
  });
  await check("le relais refuse de servir la signature du round d'ouverture", async () => {
    const res = await fetch(`${state.beaconUrl}/public/${rounds.open}`);
    assert(res.status === 425, `HTTP ${res.status} au lieu de 425`);
    return `HTTP 425, aucune clé n'existe avant T`;
  });
  await check("le juré (sans clé de centre) ne peut pas ouvrir", () =>
    expectError(() => openForCentre({ ciphertext: cotonouA.ciphertext, identity: jury.identity, client: relay }), TooEarlyError),
  );
  await check("Cotonou, avec sa propre clé, ne peut pas ouvrir non plus avant T", () =>
    expectError(() => openForCentre({ ciphertext: cotonouA.ciphertext, identity: cotonou.identity, client: relay }), TooEarlyError),
  );

  // b. Phantom centre
  step(`L'office tente d'ajouter un cinquième centre (« ${state.phantom.name} ») à la liste gelée`);
  const listed = await registry.examCentres(examId);
  await check("nouveau gel de la liste avec 5 centres", () => {
    const ids = [...listed, state.phantom.centreId];
    const root = ethers.keccak256(ethers.solidityPacked(["bytes32[]"], [ids]));
    return expectRevert(() => registry.freezeCentres(examId, ids, root, ids.length), iface, "AlreadyDone");
  });
  await check("remplacement de la clé de Cotonou par celle du centre fantôme", async () => {
    const ghost = await generateCentreKey();
    return expectRevert(() => registry.registerCentre(cotonou.centreId, recipientToBytes32(ghost.recipient), state.office.address, state.phantom.name), iface, "KeyFrozen");
  });
  await check("inscription du centre fantôme à l'examen", () =>
    expectRevert(() => registry.joinExam(examId, state.phantom.centreId, ethers.ZeroHash, "0x"), iface, "NotCentre"),
  );
  await check("la liste publique compte toujours le nombre de centres annoncé", async () => {
    const now = await registry.examCentres(examId);
    assert(now.length === state.announcedCentreCount, `${now.length} centres, ${state.announcedCentreCount} annoncés`);
    return `${now.length} centres : ${state.centres.map((c) => c.name).join(", ")}`;
  });

  // c. Burn
  step("Le comité C a vu son jeu circuler sur Telegram la veille : il le brûle avant T");
  await check("le comité D tente de brûler le jeu C", () => expectRevert(() => as(committeeD.privateKey).burnSet(examId, 2), iface, "NotCommittee"));
  await check("le comité C brûle son jeu sur la chaîne", async () => {
    const rc = await (await as(committeeC.privateKey).burnSet(examId, 2)).wait();
    const ev = rc.logs.map((l) => iface.parseLog(l)).find((l) => l?.name === "SetBurned");
    assert(ev, "pas d'événement SetBurned");
    assert(await registry.isBurned(examId, 2), "isBurned(C) est faux");
    return `bloc ${rc.blockNumber}, événement SetBurned`;
  });

  // d. Wait for T
  step(`Attente du round d'ouverture ${rounds.open}`);
  await waitRound(rounds.open, "ouverture");
  await check("round d'ouverture atteint sur le beacon et sur la chaîne", async () => `round chaîne ${await registry.currentRound()}`);

  // e. Signature from the relay
  step("Le round tombe : signature récupérée sur le relais, vérifiée localement");
  let sig;
  await check("signature du round d'ouverture valide pour la clé publique du beacon", async () => {
    const res = await fetch(`${state.beaconUrl}/public/${rounds.open}`);
    assert(res.ok, `HTTP ${res.status}`);
    const b = await res.json();
    assert(b.round === rounds.open, `round ${b.round}`);
    assert(verifyBeaconSignature(beaconInfo, rounds.open, b.signature), "signature invalide");
    sig = b.signature;
    return `${sig.slice(0, 24)}... (48 octets)`;
  });
  await check("une signature altérée est rejetée", async () => {
    const bad = (sig[0] === "a" ? "b" : "a") + sig.slice(1);
    assert(!verifyBeaconSignature(beaconInfo, rounds.open, bad), "signature altérée acceptée");
    return "rejetée";
  });
  await check("téléphone du juré : « signature valide, vous n'êtes pas un centre »", () =>
    expectError(() => openForCentre({ ciphertext: cotonouA.ciphertext, identity: jury.identity, client: relay }), WrongKeyError),
  );

  // f. Natitingou offline
  step("Natitingou, hors ligne, reçoit la signature par SMS et ouvre son paquet");
  let drawn;
  let natSet;
  let sms;
  await check("signature encodée en base32 Crockford (avec contrôle) pour le SMS", async () => {
    sms = encodeSignature(sig);
    return `${sms.length} caractères`;
  });
  if (sms) info(`SMS : ${sms}`);
  let offline;
  await check("le chef de centre retape le code (minuscules, espaces) : décodé et vérifié hors ligne", async () => {
    const typed = sms.toLowerCase().replace(/-/g, " ");
    const decoded = decodeSignature(typed);
    assert(decoded.replace(/^0x/, "") === sig.replace(/^0x/, ""), "signature décodée différente");
    offline = offlineClient(beaconInfo, rounds.open, decoded);
    return "offlineClient prêt, aucun réseau requis";
  });
  await check("un code SMS corrompu est refusé", async () => {
    const corrupted = (sms[0] === "0" ? "1" : "0") + sms.slice(1);
    try {
      offlineClient(beaconInfo, rounds.open, decodeSignature(corrupted));
    } catch (e) {
      return `refusé (${e instanceof BadSignatureError ? "BadSignatureError" : "contrôle base32"})`;
    }
    throw new Error("code corrompu accepté");
  });
  await check("tirage du jeu parmi les jeux non brûlés (C brûlé)", async () => {
    const burned = [];
    for (let i = 0; i < setCount; i++) if (await registry.isBurned(examId, i)) burned.push(i);
    assert(burned.length === 1 && burned[0] === 2, `jeux brûlés sur la chaîne : [${burned}]`);
    const submitted = [];
    for (let i = 0; i < setCount; i++) if ((await registry.packageOf(examId, i))[0] !== ethers.ZeroHash) submitted.push(i);
    drawn = drawSet(sig, setCount, burned, submitted);
    assert(drawn !== 2, "le jeu brûlé C a été tiré");
    return `jeux brûlés [${burned.map(labelOf)}], jeu tiré : ${labelOf(drawn)}`;
  });
  let natRender;
  await check(`Natitingou ouvre le jeu tiré avec sa clé`, async () => {
    const pkg = await fetchPackage(drawn, natitingou.centreId);
    const plain = await openForCentre({ ciphertext: pkg.ciphertext, identity: natitingou.identity, client: offline });
    natSet = parseExamSet(new TextDecoder().decode(plain));
    assert(natSet.setLabel === `Jeu ${labelOf(drawn)}`, `jeu ouvert ${natSet.setLabel}`);
    natRender = renderForCentre(natSet, natitingou.centreId, natitingou.rcHex, sig);
    return `${natSet.setLabel}, ${natSet.questions.length} questions`;
  });
  if (natRender) {
    // The first 3 lines are the header; show them and the first printed question with its options.
    const lines = natRender.text.split("\n");
    const firstQuestionEnd = lines.findIndex((l, i) => i > 3 && /^\d+\. /.test(l));
    info("Rendu à empreinte de Natitingou (en-tête et première question imprimée) :");
    for (const line of lines.slice(0, firstQuestionEnd > 0 ? firstQuestionEnd : 3)) info(`  | ${line}`);
    info(`  | ... ordre des questions [${natRender.order.map((q) => q + 1).join(", ")}], marques ${natRender.marks.slice(0, 23)}...`);
  }
  await check(`exemplaires du procès-verbal désignés par la signature (sur ${COPIES_PER_CENTRE})`, async () => {
    const idx = recordCopyIndexes(sig, COPIES_PER_CENTRE);
    assert(idx.length === 3, `${idx.length} exemplaires`);
    return `exemplaires n° ${idx.join(", ")} de la pile imprimée`;
  });

  // g. Every centre
  step("Chaque centre ouvre sa copie du jeu tiré (relais en ligne)");
  const renders = new Map();
  for (const c of state.centres) {
    await check(`${c.name}`, async () => {
      const pkg = await fetchPackage(drawn, c.centreId);
      const set = parseExamSet(new TextDecoder().decode(await openForCentre({ ciphertext: pkg.ciphertext, identity: c.identity, client: relay })));
      assert(serializeExamSet(set) === serializeExamSet(readJson(path.join(FILES.setsDir, `set-${drawn}.json`))), "contenu différent du brouillon du comité");
      const r = renderForCentre(set, c.centreId, c.rcHex, sig);
      renders.set(c.centreId, r.text);
      return `${set.setLabel} ouvert, empreinte ${r.marks.slice(0, 11)}...`;
    });
  }
  await check("les quatre rendus imprimés sont tous différents (empreinte par centre)", async () => {
    assert(new Set(renders.values()).size === state.centres.length, "deux centres ont le même rendu");
    return "4 rendus distincts";
  });
  await check("le jeu de réserve R reste fermé jusqu'à son propre round", async () => {
    const pkg = await fetchPackage(setCount, cotonou.centreId);
    return expectError(() => openForCentre({ ciphertext: pkg.ciphertext, identity: cotonou.identity, client: relay }), TooEarlyError);
  });

  // h. Reveal
  step(`Attente du round de révélation ${rounds.reveal}`);
  await waitRound(rounds.reveal, "révélation");
  step("Après la révélation : les jeux et tous les r_c s'ouvrent publiquement");
  const publicSets = [];
  for (let i = 0; i < setCount; i++) {
    await check(`copie publique du jeu ${labelOf(i)}`, async () => {
      const [, uri] = await registry.packageOf(examId, i);
      const dir = path.dirname(path.join(SHARED_DIR, uri));
      const index = readJson(path.join(SHARED_DIR, uri));
      const text = await openText({ tlocked: fs.readFileSync(path.join(dir, index.publicCopy), "utf8"), client: relay });
      const set = parseExamSet(text);
      assert(serializeExamSet(set) === serializeExamSet(readJson(path.join(FILES.setsDir, `set-${i}.json`))), "copie publique différente du jeu scellé");
      publicSets.push({ setIndex: i, set });
      return `${set.setLabel} lisible par tous${i === 2 ? " (jeu brûlé)" : ""}${i === drawn ? " (jeu tiré)" : ""}`;
    });
  }
  await check("la copie publique du jeu de réserve R attend sa propre révélation", async () => {
    const [, uri] = await registry.packageOf(examId, setCount);
    const index = readJson(path.join(SHARED_DIR, uri));
    const tlocked = fs.readFileSync(path.join(SHARED_DIR, path.dirname(uri), index.publicCopy), "utf8");
    return expectError(() => openText({ tlocked, client: relay }), TooEarlyError);
  });
  const revealedRc = [];
  for (const c of state.centres) {
    await check(`r_c de ${c.name} ouvert depuis la chaîne, conforme à son engagement`, async () => {
      const part = await registry.participation(examId, c.centreId);
      const rc = await openRc({ tlocked: ethers.toUtf8String(part.tlockedRc), client: relay });
      assert(commitRc(rc) === part.rcCommit, "H(r_c) différent de l'engagement publié");
      assert(rc === c.rcHex, "r_c différent de celui du centre");
      revealedRc.push({ centreId: c.centreId, rcHex: rc });
      return `${rc.slice(0, 18)}...`;
    });
  }

  // i. Verifier, with public data only (public copies, r_c opened from the chain, the signature)
  step("Vérificateur daté (données publiques uniquement)");
  const base = { openRoundTimeMs: T, revealRoundTimeMs: revealT, sets: publicSets, drawnSet: drawn, signatureHex: sig, centres: revealedRc };
  // Seen between T and the reveal round: after reveal every rendering is computable by anyone.
  const inCentreWindow = T + Math.floor((revealT - T) / 2);
  const nameOf = (id) => state.centres.find((c) => c.centreId === id)?.name ?? id;
  const photo = renders.get(parakou.centreId);
  await check("photo d'une copie de Parakou (centre 2) vue après T, avant la révélation", async () => {
    const v = attributeLeak({ ...base, leakedText: photo, seenAtMs: inCentreWindow });
    assert(v.verdict === "centre" && v.centreId === parakou.centreId, `verdict ${v.verdict} ${v.centreId ? nameOf(v.centreId) : ""}`);
    return `verdict « centre » : ${nameOf(v.centreId)} (score ${v.score.toFixed(2)})`;
  });
  await check("texte du jeu C vu sur Telegram la veille (avant T)", async () => {
    const leak = renderPlain(publicSets.find((s) => s.setIndex === 2).set);
    const v = attributeLeak({ ...base, leakedText: leak, seenAtMs: T - 24 * 3600_000 });
    assert(v.verdict === "committee" && v.setIndex === 2, `verdict ${v.verdict} ${v.setIndex ?? ""}`);
    return `verdict « comité » : ${labelOf(v.setIndex)} (score ${v.score.toFixed(2)})`;
  });
  await check("texte du jeu tiré retapé dans l'ordre canonique, vu après T", async () => {
    const leak = renderPlain(publicSets.find((s) => s.setIndex === drawn).set);
    const v = attributeLeak({ ...base, leakedText: leak, seenAtMs: inCentreWindow });
    assert(v.verdict === "unattributed", `verdict ${v.verdict}`);
    return `verdict « non attribuée » (fuite en fenêtre de centre, le comité ${labelOf(drawn)} n'est pas accusé)`;
  });
  await check("rumeur sans rapport", async () => {
    const rumour = "Le sujet de maths tombera sur la géométrie dans l'espace et les probabilités, mon cousin à Parakou l'a vu hier soir.";
    const v = attributeLeak({ ...base, leakedText: rumour, seenAtMs: T + 60_000 });
    assert(v.verdict === "no-match", `verdict ${v.verdict}`);
    return `verdict « aucune correspondance » (score ${v.score.toFixed(2)})`;
  });

  // j. Flag
  step("Signalement public de Parakou avec la preuve (après la révélation)");
  await check("flagCentre(Parakou) accepté sur la chaîne", async () => {
    const evidence = ethers.keccak256(ethers.toUtf8Bytes(photo));
    const rc = await (await registry.flagCentre(examId, parakou.centreId, evidence)).wait();
    const ev = rc.logs.map((l) => iface.parseLog(l)).find((l) => l?.name === "CentreFlagged");
    assert(ev && ev.args.centreId === parakou.centreId && ev.args.evidenceHash === evidence, "événement CentreFlagged absent ou faux");
    return `événement CentreFlagged, preuve ${evidence.slice(0, 18)}...`;
  });

  console.log(`\n${failures === 0 ? "RÉSULTAT : OK" : "RÉSULTAT : FAIL"} (${checks - failures}/${checks} vérifications conformes)`);
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
        info(`${what} dans ${Math.ceil(left / 1000)} s`);
        lastPrint = Date.now();
      }
      await sleep(Math.min(Math.max(left, 200), 1000));
    }
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.log(`\nFAIL  erreur inattendue : ${e?.stack ?? e}`);
    process.exit(1);
  });
