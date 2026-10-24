#!/usr/bin/env node
// Seeds the "Regional mock mathematics exam" demo on a freshly deployed SealRegistry.
// Assumes: beacon-server.mjs and a Hardhat node are running, ../shared/deployment.json exists and
// was deployed with the genesis and period of ../shared/beacon-info.json.
// Usage: node seed-demo.mjs [--open-in 120] [--beacon http://127.0.0.1:8787] [--rpc http://127.0.0.1:8545]
// Writes ../shared/sets/, ../shared/packages/<examId>/ and ../shared/demo-state.json (demo keys,
// gitignored). Rerun after a fresh deploy; on an already seeded contract it stops with a message.
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import {
  commitRc,
  generateCentreKey,
  httpBeaconClient,
  listRoot,
  newRc,
  recipientToBytes32,
  roundAt,
  roundTime,
  sealPackage,
  serializeExamSet,
  tlockRc,
  tlockText,
} from "@sealhour/seal";
import {
  DEFAULT_BEACON_URL,
  DEFAULT_RPC_URL,
  FILES,
  centreIdOf,
  ensureWallClockMining,
  loadDeployment,
  parseArgs,
  readBeaconPin,
  readJson,
  silenceTlockLogs,
  writeJson,
} from "./lib.mjs";
import { EXAM_TITLE, SET_LABELS, SUBJECT, demoSet } from "./demo-sets.mjs";

const CENTRE_NAMES = ["Northgate", "Riverside", "Eastport", "Hillcrest"];
const PHANTOM_NAME = "Phantom centre";
const ROUND_GAP = 20; // open -> reveal -> reserveOpen -> reserveReveal
const FUNDING = ethers.parseEther("10");

silenceTlockLogs();
const args = parseArgs(process.argv.slice(2), { "open-in": "int", beacon: "string", rpc: "string" });
const openIn = args["open-in"] ?? 120;
const beaconUrl = (args.beacon ?? DEFAULT_BEACON_URL).replace(/\/+$/, "");

const log = (msg) => console.log(`[seed] ${msg}`);

async function main() {
  const deployment = loadDeployment();
  const rpcUrl = args.rpc ?? deployment.rpcUrl ?? DEFAULT_RPC_URL;
  if (!fs.existsSync(FILES.beaconInfo)) throw new Error(`${FILES.beaconInfo} is missing: start beacon-server.mjs first`);
  const info = readJson(FILES.beaconInfo);
  if (deployment.genesisTime !== info.genesis_time || deployment.period !== info.period) {
    throw new Error(
      `deployment (genesis ${deployment.genesisTime}, period ${deployment.period}) does not match beacon-info.json ` +
        `(genesis ${info.genesis_time}, period ${info.period}): redeploy with BEACON_GENESIS and BEACON_PERIOD`,
    );
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { pollingInterval: 250 });
  const { chainId } = await provider.getNetwork();
  if (Number(chainId) !== deployment.chainId) throw new Error(`node chainId ${chainId}, deployment says ${deployment.chainId}`);
  if ((await provider.getCode(deployment.address)) === "0x") throw new Error(`no contract at ${deployment.address}: deploy first`);
  if (await ensureWallClockMining(provider)) log("Hardhat node: one block per second, timestamps aligned to the wall clock");

  // Office = account 0 of the node, the deployer. It signs through the node's unlocked account:
  // no office private key is known to the scripts or written to demo-state.json.
  const office = await provider.getSigner(0);
  const account0Address = await office.getAddress();
  if (account0Address !== deployment.office) throw new Error(`account 0 ${account0Address} is not the contract office ${deployment.office}`);

  const registry = new ethers.Contract(deployment.address, deployment.abi, office);
  // The relay must serve exactly the chain pinned in the contract.
  const pin = await readBeaconPin(registry, deployment);
  if (pin.chainHash !== info.hash || pin.publicKey !== info.public_key) throw new Error("beacon-info.json differs from the beacon pin stored in the contract");
  const client = httpBeaconClient(beaconUrl, pin);
  const served = await client.chain().info();
  if (served.hash !== info.hash) throw new Error(`beacon at ${beaconUrl} serves chain ${served.hash}, beacon-info.json has ${info.hash}`);
  const centreIds = CENTRE_NAMES.map(centreIdOf);
  const existing = await registry.getCentre(centreIds[0]);
  if (existing.frozen) throw new Error("this contract is already seeded (centre list frozen): redeploy, then seed again");

  // Fresh demo identities.
  const committees = SET_LABELS.slice(0, 4).map((label, setIndex) => ({ setIndex, label, wallet: ethers.Wallet.createRandom() }));
  const reserve = { setIndex: 4, label: "R", wallet: ethers.Wallet.createRandom() };
  const centres = [];
  for (const name of CENTRE_NAMES) {
    const key = await generateCentreKey();
    centres.push({ centreId: centreIdOf(name), name, wallet: ethers.Wallet.createRandom(), ...key, rcHex: newRc() });
  }
  const examId = ethers.keccak256(ethers.toUtf8Bytes(`${EXAM_TITLE}|${deployment.address}|${Date.now()}`));

  // 1. Office: fund every demo wallet and register the four centres (one batch, explicit nonces).
  let nonce = await provider.getTransactionCount(account0Address, "pending");
  const batch = [];
  for (const w of [...committees, reserve, ...centres].map((x) => x.wallet)) {
    batch.push(await office.sendTransaction({ to: w.address, value: FUNDING, nonce: nonce++ }));
  }
  for (const c of centres) {
    batch.push(await registry.registerCentre(c.centreId, recipientToBytes32(c.recipient), c.wallet.address, c.name, { nonce: nonce++ }));
  }
  await Promise.all(batch.map((tx) => tx.wait()));
  log(`${batch.length - centres.length} demo wallets funded, ${centres.length} centres registered with their X25519 key`);

  // 2. Freeze the list (root published in the official notice).
  const root = listRoot(centreIds);
  await (await registry.freezeCentres(examId, centreIds, root, centreIds.length)).wait();
  log(`list frozen: ${CENTRE_NAMES.join(", ")} (root ${root.slice(0, 18)}...)`);

  // 3. Create the exam. Rounds from the beacon clock.
  const open = roundAt(info, Date.now() + openIn * 1000);
  const rounds = { open, reveal: open + ROUND_GAP, reserveOpen: open + 2 * ROUND_GAP, reserveReveal: open + 3 * ROUND_GAP };
  const chainRound = Number(await registry.currentRound());
  if (rounds.open <= chainRound) throw new Error(`open round ${rounds.open} is not after the chain round ${chainRound}: raise --open-in`);
  await (
    await registry.createExam(
      examId,
      rounds.open,
      rounds.reveal,
      rounds.reserveOpen,
      rounds.reserveReveal,
      committees.map((c) => c.wallet.address),
      reserve.wallet.address,
    )
  ).wait();
  log(`exam created: opening at round ${rounds.open}, reveal ${rounds.reveal}, reserve ${rounds.reserveOpen} and ${rounds.reserveReveal}`);

  // 4. Committees: write the drafts, seal one copy per centre, publish the public copy, submit the root.
  fs.rmSync(FILES.setsDir, { recursive: true, force: true });
  fs.rmSync(FILES.packagesDir, { recursive: true, force: true });
  const sealers = [...committees, reserve];
  const packages = [];
  const submissions = [];
  for (const k of sealers) {
    const set = demoSet(k.label);
    writeJson(path.join(FILES.setsDir, `set-${k.setIndex}.json`), set);
    const isReserve = k === reserve;
    const round = isReserve ? rounds.reserveOpen : rounds.open;
    const revealRound = isReserve ? rounds.reserveReveal : rounds.reveal;
    const sealed = await sealPackage({ set, centres: centres.map((c) => ({ centreId: c.centreId, recipient: c.recipient })), round, client });
    const dir = path.join(FILES.packagesDir, examId, `set-${k.setIndex}`);
    fs.mkdirSync(dir, { recursive: true });
    const items = [];
    for (const it of sealed.items) {
      const file = `${it.centreId}.tlock`;
      fs.writeFileSync(path.join(dir, file), it.ciphertext);
      items.push({ centreId: it.centreId, file, leaf: it.leaf });
    }
    fs.writeFileSync(path.join(dir, "public.tlock"), await tlockText(serializeExamSet(set), revealRound, client));
    writeJson(path.join(dir, "index.json"), { setIndex: k.setIndex, label: k.label, round, root: sealed.root, items, publicCopy: "public.tlock" });
    const uri = `packages/${examId}/set-${k.setIndex}/index.json`;
    packages.push({ setIndex: k.setIndex, root: sealed.root, uri });
    const asCommittee = registry.connect(k.wallet.connect(provider));
    submissions.push(await asCommittee.submitPackage(examId, k.setIndex, sealed.root, uri));
  }

  // 5. Centres: commit to r_c and tlock it to the reveal round.
  const joins = [];
  for (const c of centres) {
    const tlocked = await tlockRc(c.rcHex, rounds.reveal, client);
    const asCentre = registry.connect(c.wallet.connect(provider));
    joins.push(await asCentre.joinExam(examId, c.centreId, commitRc(c.rcHex), ethers.toUtf8Bytes(tlocked)));
  }
  await Promise.all([...submissions, ...joins].map((tx) => tx.wait()));
  log(`${packages.length} packages sealed and published (sets ${SET_LABELS.join(", ")}), ${joins.length} centres joined the exam`);

  // 6. Check what the chain now holds.
  for (const p of packages) {
    const [onChainRoot] = await registry.packageOf(examId, p.setIndex);
    if (onChainRoot !== p.root) throw new Error(`package ${p.setIndex}: root on chain ${onChainRoot} differs from ${p.root}`);
  }
  for (const c of centres) {
    const part = await registry.participation(examId, c.centreId);
    if (!part.joined || part.rcCommit !== commitRc(c.rcHex)) throw new Error(`centre ${c.name} did not join correctly`);
  }

  const state = {
    examId,
    examTitle: EXAM_TITLE,
    subject: SUBJECT,
    beaconUrl,
    rpcUrl,
    contract: deployment.address,
    rounds,
    announcedCentreCount: CENTRE_NAMES.length,
    office: { address: account0Address, privateKey: null },
    committees: committees.map((k) => ({ setIndex: k.setIndex, label: k.label, address: k.wallet.address, privateKey: k.wallet.privateKey })),
    reserveCommittee: { setIndex: reserve.setIndex, label: reserve.label, address: reserve.wallet.address, privateKey: reserve.wallet.privateKey },
    centres: centres.map((c) => ({
      centreId: c.centreId,
      name: c.name,
      address: c.wallet.address,
      privateKey: c.wallet.privateKey,
      identity: c.identity,
      recipient: c.recipient,
      rcHex: c.rcHex,
    })),
    packages,
    phantom: { centreId: centreIdOf(PHANTOM_NAME), name: PHANTOM_NAME },
  };
  writeJson(FILES.demoState, state);
  const left = Math.round((roundTime(info, rounds.open) - Date.now()) / 1000);
  log(`state written to ${path.relative(process.cwd(), FILES.demoState) || FILES.demoState}; opening in ${left} s`);
}

main().catch((e) => {
  console.error(`[seed] FAILED: ${e?.shortMessage ?? e?.message ?? e}`);
  process.exit(1);
});
