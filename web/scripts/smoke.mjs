// Browser smoke check of the exported site, without a chain.
// 1. No config.json: every page renders the setup message, no page errors.
// 2. /selftest: the seal module (tlock + age, base32, render) runs in the browser bundle.
// 3. Config whose chain and relay are down (or a live stack with --live): pages render, errors are handled.
// Usage: node scripts/smoke.mjs [--live]   (expects `npm run build` done; uses the preinstalled Playwright)
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(path.join(execSync("npm root -g").toString().trim(), "playwright"));
}

const here = path.dirname(new URL(import.meta.url).pathname);
const webDir = path.join(here, "..");
const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = ["/", "/enrolement/", "/comite/", "/centre/", "/public/"];
const live = process.argv.includes("--live");

const server = spawn(process.execPath, [path.join(here, "serve.mjs"), path.join(webDir, "out"), String(PORT)], { stdio: "pipe" });
await new Promise((r) => server.stdout.once("data", r));

const failures = [];
const log = (s) => console.log(s);

function watch(page, label) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Network failures are logged by the browser itself, not by the app: listed apart.
    if (/Failed to load resource|ERR_CONNECTION_REFUSED/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return () => {
    if (errors.length) failures.push(`${label}: ${errors.join(" | ")}`);
    return errors;
  };
}

const browser = await playwright.chromium.launch();
try {
  // 1. Missing config.
  for (const p of PAGES) {
    const page = await browser.newPage();
    const done = watch(page, `no-config ${p}`);
    await page.goto(BASE + p, { waitUntil: "networkidle" });
    const ok = await page.locator('[data-testid="setup-message"]').first().isVisible().catch(() => false);
    const errs = done();
    log(`[no-config] ${p} setup message: ${ok ? "yes" : "NO"}, errors: ${errs.length}`);
    if (!ok) failures.push(`no-config ${p}: setup message missing`);
    await page.close();
  }

  // Language toggle on one page.
  {
    const page = await browser.newPage();
    const done = watch(page, "lang");
    await page.goto(BASE + "/centre/", { waitUntil: "networkidle" });
    await page.click('[data-testid="lang-toggle"]');
    const h = await page.locator("h2").first().textContent();
    done();
    log(`[lang] after toggle: "${h}"`);
    if (h !== "Configuration missing") failures.push(`lang toggle: got ${h}`);
    await page.close();
  }

  // 2. Browser self test of the seal bundle.
  {
    const page = await browser.newPage();
    const done = watch(page, "selftest");
    await page.goto(BASE + "/selftest/", { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector('[data-testid="selftest"]')?.textContent !== "running", null, { timeout: 120000 });
    const status = await page.locator('[data-testid="selftest"]').textContent();
    const detail = await page.locator("pre.code").textContent();
    done();
    log(`[selftest] ${status}\n${detail}`);
    if (status !== "PASS") failures.push(`selftest: ${status} ${detail}`);
    await page.close();
  }

  // 3. A config with the chain and relay down (or the real one with --live).
  {
    const fs = await import("node:fs");
    let config;
    if (live) {
      config = JSON.parse(fs.readFileSync(path.join(webDir, "public", "config.json"), "utf8"));
    } else {
      const dep = JSON.parse(fs.readFileSync(path.join(webDir, "..", "contracts", "artifacts", "contracts", "SealRegistry.sol", "SealRegistry.json"), "utf8"));
      config = {
        deployment: { address: "0x5FbDB2315678afecb367f032d93F642f64180aa3", abi: dep.abi, chainId: 31337, rpcUrl: "http://127.0.0.1:59998", genesisTime: Math.floor(Date.now() / 1000) - 600, period: 3, office: "0x0000000000000000000000000000000000000001" },
        demo: {
          examId: "0x" + "ab".repeat(32), examTitle: "Examen blanc", subject: "Maths", rounds: { open: 0, reveal: 0, reserveOpen: 0, reserveReveal: 0 }, announcedCentreCount: 4,
          office: { address: "0x0000000000000000000000000000000000000001", privateKey: "0x" + "01".repeat(32) },
          committees: [{ setIndex: 0, label: "A", address: "0x0000000000000000000000000000000000000002", privateKey: "0x" + "02".repeat(32) }],
          reserveCommittee: { setIndex: 1, label: "R", address: "0x0000000000000000000000000000000000000003", privateKey: "0x" + "03".repeat(32) },
          centres: [], packages: [], phantom: { centreId: "0x" + "cd".repeat(32), name: "Centre fantôme" },
        },
        beaconUrl: "http://127.0.0.1:59997",
        packagesBaseUrl: "/shared",
      };
    }
    for (const p of PAGES) {
      const page = await browser.newPage();
      if (!live) await page.route("**/config.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(config) }));
      const done = watch(page, `${live ? "live" : "down"} ${p}`);
      await page.goto(BASE + p, { waitUntil: "load" });
      await page.waitForTimeout(live ? 4000 : 2500);
      const badge = await page.locator('[data-testid="demo-badge"]').isVisible().catch(() => false);
      const errorBox = await page.locator('[data-testid="error"]').count();
      const errs = done();
      log(`[${live ? "live" : "chain-down"}] ${p} demo badge: ${badge ? "yes" : "NO"}, error notices shown: ${errorBox}, page errors: ${errs.length}`);
      if (!badge) failures.push(`${p}: demo badge missing`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error("SMOKE FAILED\n" + failures.join("\n"));
  process.exit(1);
}
console.log("SMOKE OK");
