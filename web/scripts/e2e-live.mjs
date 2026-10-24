// Live browser test of the four screens against a running local stack (chain, beacon, seed fresh).
// Replays the final demo: no key before T, phantom refused, committee seals (AlreadyDone handled) and
// burns C, centre refused before T, offline opening from base32, juror refused, reveal, verifier
// presets, flag; then reserve mode, enrolment of a new exam, count mismatch refusal, TooLate.
// Usage: node scripts/e2e-live.mjs <config.json> <app/shared dir>   (after `npm run build`)
// The seed must leave at least about 40 s before the opening round. Takes until the reserve round.
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
const require = createRequire(import.meta.url);
const playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
const WEB = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const [configPath, sharedDir] = process.argv.slice(2);
if (!configPath || !sharedDir) {
  console.error("usage: node scripts/e2e-live.mjs <config.json> <shared dir>");
  process.exit(2);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const LABEL = "exam-test-" + Date.now();
const PORT = 3124, BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, [path.join(WEB, "scripts/serve.mjs"), path.join(WEB, "out"), String(PORT), path.resolve(sharedDir)], { stdio: "pipe" });
await new Promise((r) => server.stdout.once("data", r));
const browser = await playwright.chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
await ctx.route("**/config.json", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) }));
const errors = [];
const results = [];
let p;
const ok = (name, cond, extra = "") => { results.push(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`); };
async function open(p) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${p} pageerror ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`${p} console ${m.text()}`); });
  await page.goto(BASE + p, { waitUntil: "load" });
  return page;
}
const text = async (page, sel, timeout = 60000) => { await page.waitForSelector(sel, { timeout }); return (await page.locator(sel).first().textContent()) ?? ""; };
const genesis = config.deployment.genesisTime, period = config.deployment.period;
const roundAt = () => Math.floor((Date.now() / 1000 - genesis) / period) + 1;
// Unfold a folded step (done or future steps fold; the current step has no toggle).
const unfold = async (page, id) => { const b = page.locator(`${id} > .card-header button[aria-expanded="false"]`); if (await b.count()) await b.click(); };
const waitRound = async (r) => { while (roundAt() < r + 1) await new Promise((x) => setTimeout(x, 1000)); };
const R = config.demo.rounds;
console.log("current round", roundAt(), "rounds", R);
try {
  // Before T
  if (roundAt() + 20 / period >= R.open) throw new Error(`opening round ${R.open} too close (current ${roundAt()}): reseed with a later opening`);
  p = await open("/public/");
  ok("public no-key statement", (await text(p, '[data-testid="no-key"]')).includes(`round ${R.open}`));
  await p.waitForFunction(() => /425/.test(document.querySelector('[data-testid="relay-status"]')?.textContent ?? ""), null, { timeout: 20000 }).catch(() => {});
  await p.click('#juror .verify > button'); // relay status is in the juror's "Verify it yourself"
  ok("relay 425 before T", (await text(p, '[data-testid="relay-status"]')).includes("425"));
  await p.click('[data-testid="juror-open"]');
  ok("juror before T refused (too early)", /Too early/.test(await text(p, '[data-testid="juror-result"]')), await text(p, '[data-testid="juror-result"]'));
  // English UI on a loaded page (moved from the reserve phase: #proof exists only before the reveal)
  ok("english", /Proof: no key/.test(await text(p, "#proof h2")));
  await p.close();

  p = await open("/enrolment/");
  await p.waitForSelector('[data-testid="phantom"]:not([disabled])', { timeout: 30000 });
  ok("freeze button disabled (already frozen)", await p.locator('[data-testid="freeze"]').isDisabled());
  await p.click('[data-testid="phantom"]');
  const ph = await text(p, '[data-testid="phantom-result"]');
  ok("phantom refused", /AlreadyDone/.test(ph) && /KeyFrozen/.test(ph), ph.replace(/\s+/g, " "));
  await p.close();

  p = await open("/committee/");
  await p.selectOption('[data-testid="role-committee"]', "committee-2");
  await p.waitForSelector('[data-testid="set-valid"]', { timeout: 30000 });
  ok("committee list ok (count matches)", (await text(p, '[data-testid="chain-count"]')) === "4");
  await unfold(p, "#seal");
  await p.click('[data-testid="seal"]');
  await p.waitForSelector('[data-testid="sealed"]', { timeout: 60000 });
  ok("sealed in browser", true, (await text(p, '[data-testid="sealed"] .notice')).slice(0, 80));
  // seal now also publishes: no separate submit-package click
  ok("submit handles AlreadyDone", /AlreadyDone/.test(await text(p, '[data-testid="already-done"]')));
  await p.click('[data-testid="burn"]');
  await p.click('[data-testid="burn-confirm"]');
  await p.waitForSelector('#burn .notice-ok, #burn [data-testid="error"]', { timeout: 30000 });
  ok("burn set C", (await p.locator("#burn .notice-ok").count()) > 0, await text(p, "#burn .notice"));
  await p.close();

  p = await open("/centre/");
  await p.selectOption('[data-testid="role-centre"]', "centre-3");
  await p.waitForSelector("#key .chip-ok", { timeout: 30000 });
  ok("centre key check ok", (await p.locator('[data-testid="key-blocked"]').count()) === 0);
  await p.click('[data-testid="try-early"]');
  const te = await text(p, '[data-testid="too-early"]');
  ok("centre try early refused", /Too early/.test(te) && /425/.test(te), te.replace(/\s+/g, " "));
  await p.close();

  console.log("waiting for open round", R.open, "current", roundAt());
  await waitRound(R.open);
  p = await open("/centre/");
  await p.selectOption('[data-testid="role-centre"]', "centre-3");
  await p.waitForSelector('[data-testid="fetch-signature"]:not([disabled])', { timeout: 30000 });
  await p.click('[data-testid="fetch-signature"]'); // gets the signature and opens
  await p.click('[data-testid="opened-details"] > button'); // SMS code is in "Verify it yourself"
  const b32 = await text(p, '[data-testid="base32"]');
  ok("signature from relay verified, base32 shown", b32.length > 40, b32);
  await p.reload();
  await p.selectOption('[data-testid="role-centre"]', "centre-3");
  await p.click('[data-testid="sms-toggle"]');
  await p.fill("#sig-b32", b32.toLowerCase());
  await p.click('[data-testid="paste-signature"]');
  await p.waitForSelector('[data-testid="signature-ok"]', { timeout: 20000 }); // paste-signature also opens
  const opened = await text(p, '[data-testid="opened"] .notice', 60000);
  ok("offline open + draw avoids C", /Drawn set/.test(opened) && !/Drawn set: C/.test(opened), opened);
  ok("paper rendered", (await text(p, '[data-testid="paper"]')).length > 200);
  ok("record copies", /\d+, \d+, \d+/.test(await text(p, '[data-testid="record-copies"]')), await text(p, '[data-testid="record-copies"] .big'));
  // Typo detection
  await p.fill("#sig-b32", b32.slice(0, 5) + (b32[5] === "A" ? "B" : "A") + b32.slice(6));
  await p.click('[data-testid="paste-signature"]');
  ok("base32 typo detected", /Mistyped/.test(await text(p, '#signature [data-testid="error"]')));
  await p.close();

  p = await open("/public/");
  await p.click('[data-testid="juror-open"]');
  ok("juror after T: not a centre", /not a centre/.test(await text(p, '[data-testid="juror-result"]')));
  await p.close();

  console.log("waiting for reveal round", R.reveal, "current", roundAt());
  await waitRound(R.reveal);
  p = await open("/public/");
  await p.waitForSelector('[data-testid="reveal"]');
  await p.click('[data-testid="reveal"]');
  const rc = await text(p, '[data-testid="rc-checks"]', 90000);
  ok("r_c all OK", (rc.match(/OK/g) ?? []).length === 4 && !/FAIL/.test(rc), rc.replace(/\s+/g, " "));
  ok("public copies opened", (await p.locator("#reveal .chip-ok").count()) >= 4);
  for (const [k, re] of [["photo", /Centre\..*Riverside/], ["before", /Committee\..*committee C/], ["retyped", /Unattributed/]]) {
    await p.click(`[data-testid="preset-${k}"]`);
    await p.click('[data-testid="verify"]');
    const v = await text(p, '[data-testid="verdict"]');
    ok(`verifier ${k}`, re.test(v), v);
  }
  await p.click('[data-testid="flag"]');
  await p.waitForSelector('#flag .notice-ok, #flag [data-testid="error"]', { timeout: 30000 });
  ok("flag centre after reveal", (await p.locator("#flag .notice-ok").count()) > 0, await text(p, "#flag .notice"));
  await p.close();

  console.log("waiting for reserve round", R.reserveOpen, "current", roundAt());
  await waitRound(R.reserveOpen);

  {
  // Reserve mode (reserve open round passed)
  p = await open("/centre/");
  await p.selectOption('[data-testid="role-centre"]', "centre-0");
  await p.check('[data-testid="reserve-toggle"]');
  await p.waitForSelector('[data-testid="fetch-signature"]:not([disabled])', { timeout: 30000 });
  await p.click('[data-testid="fetch-signature"]');
  await p.waitForSelector('[data-testid="signature-ok"]'); // fetch-signature also opens
  ok("reserve open", /Reserve set R/.test(await text(p, '[data-testid="opened"] .notice')), await text(p, '[data-testid="opened"] .notice'));
  await p.close();

  }
  // Enrolment: register new centre, new exam with 3 centres, create exam
  p = await open("/enrolment/");
  await p.waitForSelector('[data-testid="centres-table"]', { state: "attached" }); // table is in a folded step
  await p.click('[data-testid="acting-as"]');
  await p.selectOption('[data-testid="role"]', "office");
  await p.keyboard.press("Escape");
  await unfold(p, "#register");
  await p.fill("#c-name", "Westbrook-" + Date.now());
  await p.fill("#c-op", config.demo.centres[0].address);
  await p.click("text=Generate a key pair");
  await p.waitForFunction(() => document.querySelector("#c-key")?.value.startsWith("age1"));
  await p.click('[data-testid="register-centre"]');
  await p.waitForSelector("#register .notice-ok, #register [data-testid=error]", { timeout: 30000 });
  ok("register centre", /Transaction confirmed/.test(await text(p, "#register .notice-ok, #register [data-testid=error]")), await text(p, "#register .notice-ok, #register [data-testid=error]"));
  await p.click('[data-testid="other-exam"] > button');
  await p.fill("#exam-id", LABEL);
  await p.waitForSelector('#freeze [data-testid="freeze"]:not([disabled])', { timeout: 30000 });
  // keep only 3 of the 4 demo centres: untick Hillcrest
  await p.locator("#freeze input[type=checkbox]").nth(3).uncheck();
  ok("selected mismatch warning", /announces 4 centres/.test(await text(p, "#freeze .notice-warn")));
  await p.click('[data-testid="freeze"]');
  ok("freeze new exam", /Transaction confirmed/.test(await text(p, "#freeze .notice-ok")));
  await p.waitForSelector('[data-testid="create-exam"]:not([disabled])', { timeout: 30000 });
  await p.click('[data-testid="create-exam"]');
  ok("create exam", /Transaction confirmed/.test(await text(p, "#create .notice-ok")));
  // Not office: register as committee A -> NotOffice
  await p.click('[data-testid="acting-as"]');
  await p.selectOption('[data-testid="role"]', "committee-0");
  await p.keyboard.press("Escape");
  await p.fill("#c-name", "Southfield");
  await p.fill("#c-op", config.demo.centres[0].address);
  await p.click("text=Generate a key pair");
  await p.waitForFunction(() => document.querySelector("#c-key")?.value.startsWith("age1"));
  await p.click('[data-testid="register-centre"]');
  ok("NotOffice decoded", /NotOffice/.test(await text(p, '#register [data-testid="error"]')));
  await p.close();

  // Committee on the 3 centre exam: sealing refused
  p = await open("/committee/");
  await p.selectOption('[data-testid="role-committee"]', "committee-0");
  await p.click('[data-testid="other-exam"] > button');
  await p.fill("#exam-id", LABEL);
  ok("committee refuses (count mismatch)", /3 centres, the notice announces 4/.test(await text(p, '[data-testid="seal-refused"]')));
  ok("seal button disabled", await p.locator('[data-testid="seal"]').isDisabled());
  // burn on demo exam after T -> TooLate
  await p.fill("#exam-id", config.demo.examId);
  await p.waitForFunction(() => document.querySelector('[data-testid="chain-count"]')?.textContent === "4");
  await unfold(p, "#burn");
  await p.waitForSelector('[data-testid="burn"]');
  await p.click('[data-testid="burn"]');
  // the chain's TooLate refusal now shows as a Protected notice, not an error box
  ok("burn after T TooLate", /TooLate/.test(await text(p, '#burn [data-testid="burn-refused"]')));
  await p.close();
} catch (e) {
  ok("exception", false, String(e));
} finally {
  await browser.close();
  server.kill();
}
console.log("errors:", errors.length ? errors.join("\n") : "none");
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(failed || errors.length ? "E2E FAILED" : "E2E OK");
process.exit(failed || errors.length ? 1 : 0);
