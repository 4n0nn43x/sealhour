// Live end to end test on Base Sepolia and drand quicknet, headless Chromium, real transactions.
// The page sees an injected EIP-1193 wallet (announced with EIP-6963) whose requests are answered here, in Node:
// the funding key comes from DEPLOYER_KEY in the environment and never reaches the page, the logs or a file.
// Story: connect the wallet, shared registry role check, solo test setup (fund 11 burner wallets, deploy a fresh
// registry), register 4 centres, each centre publishes its key, freeze with the reviewed keys, create the exam,
// centres join, 5 committees seal and publish on chain, burn set C, juror refused before T, centre opens after T
// with the real drand signature (draw skips C), juror refused after T, reveal, verifier, flag, leftovers returned.
// Usage: DEPLOYER_KEY=0x... node scripts/e2e-testnet.mjs   (after `npm run build`; uses the global Playwright)
// Env: E2E_OPEN_MIN (minutes to the opening, default 3). E2E_LOCAL_RPC: free dry run on a local chain with chain id
// 84532 (e.g. `anvil --chain-id 84532`) and the real drand quicknet; the page reads that RPC and the shared registry
// step is skipped (it exists on Base Sepolia only).
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const WEB = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const KEY = process.env.DEPLOYER_KEY ?? "";
if (!/^(0x)?[0-9a-fA-F]{64}$/.test(KEY)) {
  console.error("DEPLOYER_KEY (a funded Base Sepolia key) must be set in the environment");
  process.exit(2);
}
const live = JSON.parse(fs.readFileSync(path.join(WEB, "public", "config.live.json"), "utf8"));
const iface = new ethers.Interface(live.abi);
const net = ethers.Network.from(84532);
const LOCAL = process.env.E2E_LOCAL_RPC ?? "";
const provider = new ethers.JsonRpcProvider(LOCAL || "https://sepolia.base.org", net, { staticNetwork: net });
const funder = new ethers.Wallet(KEY.startsWith("0x") ? KEY : "0x" + KEY, provider);
const OPEN_MIN = Number(process.env.E2E_OPEN_MIN ?? 3);
const EXPLORER = live.explorer;
const NAMES = ["Northgate", "Riverside", "Eastport", "Hillcrest"];
const PORT = 3125, BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const errors = [];
const txs = []; // { label, hash }
const ok = (name, cond, extra = "") => {
  const line = `${cond ? "PASS" : "FAIL"} ${name}${extra ? " " + String(extra).replace(/\s+/g, " ").slice(0, 200) : ""}`;
  results.push(line);
  console.log(line);
};
const eth = (wei) => `${ethers.formatEther(wei)} ETH`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every transaction the page broadcasts (burner wallets) is seen on its way to the RPC and labelled.
function labelRaw(raw) {
  const tx = ethers.Transaction.from(raw);
  if (!tx.to) return { label: "deploy SealRegistry", hash: tx.hash };
  if (tx.data === "0x") return { label: "transfer", hash: tx.hash };
  try {
    return { label: iface.parseTransaction({ data: tx.data }).name, hash: tx.hash };
  } catch {
    return { label: "call", hash: tx.hash };
  }
}

// The injected wallet: requests go to Node through an exposed function. Errors keep their code and data.
const INJECT = `(() => {
  const provider = {
    request: async ({ method, params }) => {
      const r = await window.__sealhourE2E(method, params ?? []);
      if (r && r.__error) throw Object.assign(new Error(r.__error.message), { code: r.__error.code, data: r.__error.data });
      return r;
    },
    on() {},
    removeListener() {},
  };
  const info = Object.freeze({ uuid: "6f1f3c1e-5ea1-4c1b-9a1e-5ea1b0e2e000", name: "SealHour e2e wallet", icon: "", rdns: "dev.sealhour.e2e" });
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();`;

async function walletRpc(method, params) {
  try {
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [funder.address];
      case "eth_chainId":
        return "0x14a34";
      case "net_version":
        return "84532";
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "eth_sendTransaction": {
        const t = params[0];
        const sent = await funder.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gasLimit: t.gas ? BigInt(t.gas) : undefined });
        txs.push({ label: "fund office burner (wallet)", hash: sent.hash });
        return sent.hash;
      }
      default:
        return await provider.send(method, params);
    }
  } catch (e) {
    return { __error: { code: e?.error?.code ?? e?.code ?? -32603, message: e?.shortMessage ?? e?.message ?? String(e), data: e?.data ?? e?.error?.data } };
  }
}

const server = spawn(process.execPath, [path.join(WEB, "scripts/serve.mjs"), path.join(WEB, "out"), String(PORT)], { stdio: "pipe" });
await new Promise((r) => server.stdout.once("data", r));
const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.exposeFunction("__sealhourE2E", walletRpc);
await ctx.addInitScript(INJECT);
// The demo config must not be there: this is live mode only.
await ctx.route("**/config.json", (r) => r.fulfill({ status: 404, body: "not found" }));
if (LOCAL) await ctx.route("**/config.live.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...live, rpcUrls: [LOCAL] }) }));
ctx.on("request", (req) => {
  const body = req.postData();
  if (!body || !body.includes("eth_sendRawTransaction")) return;
  try {
    for (const m of [].concat(JSON.parse(body))) if (m.method === "eth_sendRawTransaction") txs.push(labelRaw(m.params[0]));
  } catch {
    /* not JSON-RPC */
  }
});

async function open(p) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${p} pageerror ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|ERR_|status of 4\d\d/.test(m.text())) errors.push(`${p} console ${m.text()}`);
  });
  await page.goto(BASE + p, { waitUntil: "load" });
  return page;
}
const text = async (page, sel, timeout = 90000) => {
  await page.waitForSelector(sel, { timeout, state: "attached" });
  return (await page.locator(sel).first().textContent()) ?? "";
};
const unfold = async (page, id) => {
  const b = page.locator(`${id} > .card-header button[aria-expanded="false"]`);
  if (await b.count()) await b.click();
};
/** Click a transaction button and wait for a new confirmed transaction (explorer link) or an error in scope. */
async function clickTx(page, scope, testId, timeout = 180000) {
  const prev = await page.evaluate((s) => document.querySelector(`${s} [data-testid="tx-link"]`)?.getAttribute("href") ?? null, scope);
  await page.click(`[data-testid="${testId}"]`);
  // The outcome is read inside the wait: a step may fold right after its transaction confirms.
  const h = await page.waitForFunction(
    ([s, prevHref]) => {
      const err = document.querySelector(`${s} [data-testid="error"]`);
      if (err) return { ok: false, text: err.textContent };
      const a = document.querySelector(`${s} [data-testid="tx-link"]`);
      return a && a.getAttribute("href") !== prevHref ? { ok: true, text: a.getAttribute("href") } : null;
    },
    [scope, prev],
    { timeout },
  );
  return h.jsonValue();
}
async function actAs(page, key) {
  await page.click('[data-testid="acting-as"]');
  await page.selectOption('[data-testid="role"]', key);
  await page.keyboard.press("Escape");
}

const before = await provider.getBalance(funder.address);
console.log(`funder ${funder.address} balance before: ${eth(before)}`);
let solo = null;
let p;
try {
  // 1. Login: the injected wallet is discovered (EIP-6963) and connects on Base Sepolia.
  p = await open("/login/");
  await p.click('[data-testid="wallet"]', { timeout: 30000 });
  ok("wallet connected (EIP-6963, Base Sepolia)", /Base Sepolia/.test(await text(p, '[data-testid="wallet-status"]')), await text(p, '[data-testid="wallet-status"]'));

  // 2. Shared registry: the funder is its office; the role comes from chain state (office()).
  if (!LOCAL) {
    await p.click('[data-testid="enter-shared"]');
    await p.waitForSelector('[data-testid="live-banner"]', { timeout: 60000 });
    const banner = await p.locator('[data-testid="registry-link"]').getAttribute("href");
    ok("live banner links the shared registry", banner?.toLowerCase().endsWith(live.registry.address.toLowerCase()), banner);
    await p.waitForFunction(() => /office/i.test(document.querySelector('[data-testid="acting-as-name"]')?.textContent ?? ""), null, { timeout: 60000 });
    ok("shared registry: office role resolved from chain", true, await text(p, '[data-testid="acting-as-name"]'));
    ok("live badge shown", await p.locator('[data-testid="live-badge"]').isVisible());
  }

  // 3. Solo test setup: one wallet transaction, then the office burner funds the others and deploys.
  await p.goto(BASE + "/login/");
  await p.waitForSelector('[data-testid="solo-plan"]', { timeout: 60000 });
  console.log("plan:", await text(p, '[data-testid="solo-plan"]'));
  await p.click('[data-testid="solo-start"]');
  await Promise.race([
    p.waitForURL(BASE + "/", { timeout: 300000 }),
    p.waitForSelector('[data-testid="door-live"] [data-testid="error"]', { timeout: 300000 }).then(async (e) => {
      throw new Error(`solo setup failed: ${await e.textContent()}`);
    }),
  ]);
  solo = await p.evaluate(() => {
    const b = JSON.parse(localStorage.getItem("sealhour.testnet.burners") ?? "null");
    return b ? { registry: b.registry, examLabel: b.examLabel } : null; // public fields only, never the keys
  });
  ok("solo setup: burners funded, fresh registry deployed", Boolean(solo?.registry), solo?.registry);
  const reg = new ethers.Contract(solo.registry, live.abi, provider);
  const examId = ethers.id(solo.examLabel);
  ok("fresh registry pinned to drand quicknet", (await reg.beaconChainHash()).slice(2) === live.beaconChainHash && Number(await reg.period()) === 3);
  await p.close();

  // 4. Office registers the four centres by operator address (no key).
  p = await open("/enrolment/");
  await actAs(p, "office");
  await p.waitForSelector("#c-name", { timeout: 60000 });
  const operators = await p.$$eval("#demo-operators option", (os) => os.map((o) => o.value));
  for (let i = 0; i < 4; i++) {
    await unfold(p, "#register");
    await p.fill("#c-name", NAMES[i]);
    await p.fill("#c-op", operators[i]);
    const r = await clickTx(p, "#register", "register-centre");
    ok(`registerCentreOperator ${NAMES[i]}`, r.ok, r.text);
  }
  await p.close();

  // 5. Each centre creates its key on its device and publishes it (setCentreKey).
  p = await open("/centre/");
  for (let i = 0; i < 4; i++) {
    await actAs(p, `centre-${i}`);
    await p.click('[data-testid="generate-key"]', { timeout: 60000 });
    await p.waitForSelector('[data-testid="publish-key"]', { timeout: 30000 });
    const r = await clickTx(p, "#centre-key", "publish-key");
    ok(`setCentreKey ${NAMES[i]}`, r.ok, r.text);
  }
  await p.close();

  // 6. Office freezes the list with the keys it reviewed, then creates the exam.
  p = await open("/enrolment/");
  await actAs(p, "office");
  await p.waitForSelector('#freeze [data-testid="freeze"]:not([disabled])', { timeout: 60000 });
  const fr = await clickTx(p, "#freeze", "freeze");
  ok("freezeCentresWithKeys (4 reviewed keys)", fr.ok, fr.text);
  await p.waitForSelector('[data-testid="create-exam"]:not([disabled])', { timeout: 60000 });
  await p.fill("#m-open", String(OPEN_MIN));
  for (const k of ["reveal", "reserveOpen", "reserveReveal"]) await p.fill(`#m-${k}`, "1");
  const cr = await clickTx(p, "#create", "create-exam");
  ok("createExam", cr.ok, cr.text);
  await p.close();
  const exam = (await reg.examSnapshot(examId))[0];
  const R = { open: Number(exam.openRound), reveal: Number(exam.revealRound) };
  const at = (r) => (live.genesisTime + (r - 1) * live.period) * 1000;
  console.log(`opening round ${R.open} at ${new Date(at(R.open)).toISOString()}, reveal round ${R.reveal}`);

  // 7. Centres join (H(r_c) and tlock(reveal round, r_c)).
  p = await open("/centre/");
  for (let i = 0; i < 4; i++) {
    await actAs(p, `centre-${i}`);
    await p.waitForSelector('[data-testid="join"]:not([disabled])', { timeout: 60000 });
    const r = await clickTx(p, "#join", "join");
    ok(`joinExam ${NAMES[i]}`, r.ok, r.text);
  }
  await p.close();

  // 8. Committees A to D and the reserve seal in the browser and publish on chain; C burns its set.
  for (let k = 0; k < 5; k++) {
    p = await open("/committee/");
    await p.selectOption('[data-testid="role-committee"]', `committee-${k}`, { timeout: 60000 });
    await p.waitForSelector('[data-testid="set-valid"]', { timeout: 60000 });
    await unfold(p, "#seal");
    await p.waitForSelector('[data-testid="seal"]:not([disabled])', { timeout: 60000 });
    const r = await clickTx(p, "#seal", "seal");
    ok(`set ${"ABCDR"[k]} sealed, postPackageData + submitPackage("chain:")`, r.ok, r.text);
    if (k === 2) {
      await p.click('[data-testid="burn"]');
      await p.click('[data-testid="burn-confirm"]');
      await p.waitForSelector('#burn .notice-ok, #burn [data-testid="error"]', { timeout: 120000 });
      ok("burn set C", (await p.locator("#burn .notice-ok").count()) > 0, await text(p, "#burn .notice"));
    }
    await p.close();
  }
  const snap = await reg.examSnapshot(examId);
  ok("chain: 5 roots with uri chain:, set C burned, 4 joined", snap[2].every((x) => x.root !== ethers.ZeroHash && x.uri === "chain:") && snap[2][2].burned && snap[3].every((x) => x.joined));

  // 9. Before T: no key exists. Juror and centre are refused; the quicknet relay answers 425 (404 mapped).
  if (Date.now() >= at(R.open) - 15000) throw new Error("setup too slow: the opening round is already near, raise E2E_OPEN_MIN");
  p = await open("/public/");
  ok("public no-key statement", (await text(p, '[data-testid="no-key"]')).includes(`round ${R.open}`));
  await p.click("#juror .verify > button");
  await p.waitForFunction(() => /425/.test(document.querySelector('[data-testid="relay-status"]')?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
  ok("drand relay answers 425 before T", (await text(p, '[data-testid="relay-status"]')).includes("425"), await text(p, '[data-testid="relay-status"]'));
  await p.click('[data-testid="juror-open"]');
  ok("juror before T refused (too early), package read from chain", /Too early/.test(await text(p, '[data-testid="juror-result"]')), await text(p, '[data-testid="juror-result"]'));
  await p.close();
  p = await open("/centre/");
  await actAs(p, "centre-3");
  await p.click('[data-testid="try-early"]', { timeout: 60000 });
  ok("centre before T refused (too early)", /Too early/.test(await text(p, '[data-testid="too-early"]')), await text(p, '[data-testid="too-early"]'));
  await p.close();

  // 10. After T: the centre opens with the real drand quicknet signature; the draw skips burned set C.
  console.log(`waiting for the opening (${Math.round((at(R.open) - Date.now()) / 1000)} s)`);
  while (Date.now() < at(R.open) + 4000) await sleep(1000);
  p = await open("/centre/");
  await actAs(p, "centre-3");
  await p.waitForSelector('[data-testid="fetch-signature"]:not([disabled])', { timeout: 60000 });
  await p.click('[data-testid="fetch-signature"]');
  await p.waitForSelector('[data-testid="opened"] .notice, #signature [data-testid="error"]', { timeout: 120000 });
  const opened = await text(p, '[data-testid="opened"] .notice, #signature [data-testid="error"]');
  ok("centre opens after T (quicknet signature, chain package), draw skips C", /Drawn set/.test(opened) && !/Drawn set: C/.test(opened), opened);
  ok("paper rendered", (await text(p, '[data-testid="paper"]')).length > 200);
  await p.close();
  p = await open("/public/");
  await p.click('[data-testid="juror-open"]', { timeout: 60000 });
  ok("juror after T: not a centre", /not a centre/.test(await text(p, '[data-testid="juror-result"]')), await text(p, '[data-testid="juror-result"]'));
  await p.close();

  // 11. After the reveal round: public copies and r_c open, verifier, flag (juror burner signs).
  console.log(`waiting for the reveal (${Math.round((at(R.reveal) - Date.now()) / 1000)} s)`);
  while (Date.now() < at(R.reveal) + 4000) await sleep(1000);
  p = await open("/public/");
  await p.waitForSelector('[data-testid="reveal"]');
  const rc = await text(p, '[data-testid="rc-checks"]', 180000);
  ok("reveal: r_c of the 4 centres match their commitments", (rc.match(/OK/g) ?? []).length === 4 && !/FAIL/.test(rc), rc);
  ok("reveal: public copies opened", (await p.locator("#reveal .chip-ok").count()) >= 4);
  await p.click('[data-testid="preset-photo"]');
  await p.click('[data-testid="verify"]');
  ok("verifier: photo points to Riverside", /Centre\..*Riverside/.test(await text(p, '[data-testid="verdict"]')), await text(p, '[data-testid="verdict"]'));
  const fl = await clickTx(p, "#flag", "flag");
  ok("flagCentre (juror)", fl.ok, fl.text);
  await p.close();
} catch (e) {
  ok("exception", false, String(e?.message ?? e));
} finally {
  // 12. Leftovers back to the funder, whatever happened above.
  if (solo) {
    try {
      p = await open("/login/");
      await p.click('[data-testid="return-funds"]', { timeout: 60000 });
      await p.waitForSelector('[data-testid="returned"], [data-testid="burners"] [data-testid="error"]', { timeout: 180000 });
      ok("leftover funds returned", (await p.locator('[data-testid="returned"]').count()) > 0, await text(p, '[data-testid="burners"] .notice:last-child'));
    } catch (e) {
      ok("leftover funds returned", false, String(e?.message ?? e));
    }
  }
  await browser.close();
  server.kill();
}

const after = await provider.getBalance(funder.address);
console.log("\nTransactions:");
let gas = 0n;
const byLabel = {};
for (const t of txs) {
  const rc = await provider.send("eth_getTransactionReceipt", [t.hash]).catch(() => null);
  const used = rc ? BigInt(rc.gasUsed) : 0n;
  gas += used;
  (byLabel[t.label] ??= []).push(Number(used));
  console.log(`  ${t.label.padEnd(28)} ${EXPLORER}/tx/${t.hash}  gas ${used}${rc?.l1Fee ? `  L1 fee ${BigInt(rc.l1Fee)} wei` : ""}`);
}
console.log("Gas by call:", Object.entries(byLabel).map(([k, v]) => `${k} ${v.join("/")}`).join("; "));
if (solo?.registry) {
  console.log(`Registry: ${solo.registry}`);
  console.log(`  ${EXPLORER}/address/${solo.registry}`);
  console.log(`  https://base-sepolia.blockscout.com/address/${solo.registry}`);
}
console.log(`Shared registry: ${EXPLORER}/address/${live.registry.address}`);
console.log(`Funder balance before ${eth(before)}, after ${eth(after)}, cost ${eth(before - after)} (${txs.length} transactions, ${gas} gas)`);
console.log("errors:", errors.length ? errors.join("\n") : "none");
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`${results.length - failed}/${results.length} checks passed`);
console.log(failed || errors.length ? "E2E TESTNET FAILED" : "E2E TESTNET OK");
process.exit(failed || errors.length ? 1 : 0);
