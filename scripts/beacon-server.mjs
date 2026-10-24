#!/usr/bin/env node
// Local drand compatible relay (bls-unchained-g1-rfc9380, same scheme and HTTP API as quicknet).
// Usage: node beacon-server.mjs [--port 8787] [--period 3] [--reset]
// Routes (also under /<chainhash>/...):
//   GET /info              chain info (drand ChainInfo)
//   GET /public/latest     latest emitted beacon
//   GET /public/{round}    beacon of a past or current round; future round -> 425 Too Early
//   GET /chains            [chainhash]
// The key lives in ../shared/beacon-key.json, the chain info in ../shared/beacon-info.json. Both are
// created on first start (genesis = now) and reused afterwards, unless --reset.
import fs from "node:fs";
import { createHash } from "node:crypto";
import http from "node:http";
import { createLocalBeacon } from "@sealhour/seal";
import { FILES, parseArgs, readJson, writeJson } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2), { port: "int", period: "int", reset: "flag" });
const port = args.port ?? 8787;

function loadOrCreateBeacon() {
  const haveFiles = fs.existsSync(FILES.beaconKey) && fs.existsSync(FILES.beaconInfo);
  if (haveFiles && !args.reset) {
    const { secretKeyHex } = readJson(FILES.beaconKey);
    const stored = readJson(FILES.beaconInfo);
    if (args.period !== undefined && args.period !== stored.period) {
      throw new Error(
        `beacon-info.json has period ${stored.period}, --period ${args.period} asked: restart with --reset to create a new chain`,
      );
    }
    const beacon = createLocalBeacon({ genesisTime: stored.genesis_time, period: stored.period, secretKeyHex });
    if (beacon.info.hash !== stored.hash || beacon.info.public_key !== stored.public_key) {
      throw new Error("beacon-key.json does not match beacon-info.json: restart with --reset");
    }
    return { beacon, created: false };
  }
  const beacon = createLocalBeacon({ genesisTime: Math.floor(Date.now() / 1000), period: args.period ?? 3 });
  writeJson(FILES.beaconKey, { secretKeyHex: beacon.secretKeyHex });
  writeJson(FILES.beaconInfo, beacon.info);
  return { beacon, created: true };
}

const { beacon, created } = loadOrCreateBeacon();
const info = beacon.info;

/** drand beacon JSON; randomness = sha256(signature), as drand does for unchained schemes. */
function beaconJson(round) {
  const signature = beacon.sign(round);
  return { round, randomness: sha256Hex(signature), signature };
}

function sha256Hex(hex) {
  return createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex");
}

function send(res, status, body, cache) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Cache-Control": cache ?? "no-store",
  });
  res.end(JSON.stringify(body));
}

function handle(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method not allowed" });

  const url = new URL(req.url ?? "/", "http://localhost");
  let parts = url.pathname.split("/").filter(Boolean);
  // drand clients may prefix every route with the chain hash
  if (parts[0] === info.hash) parts = parts.slice(1);
  else if (parts.length > 1 && /^[0-9a-f]{64}$/.test(parts[0])) return send(res, 404, { error: "unknown chain hash" });

  if (parts.length === 1 && parts[0] === "info") return send(res, 200, info, "public, max-age=60");
  if (parts.length === 1 && parts[0] === "chains") return send(res, 200, [info.hash], "public, max-age=60");
  if (parts.length === 1 && parts[0] === "health") {
    return send(res, 200, { status: "ok", current: beacon.currentRound(), hash: info.hash });
  }
  if (parts.length === 2 && parts[0] === "public") {
    const current = beacon.currentRound();
    if (parts[1] === "latest" || parts[1] === "0") {
      if (current < 1) return send(res, 425, { error: "beacon has not started yet", current });
      return send(res, 200, beaconJson(current));
    }
    if (!/^\d+$/.test(parts[1])) return send(res, 400, { error: "round must be a positive integer" });
    const round = Number(parts[1]);
    if (!Number.isSafeInteger(round)) return send(res, 400, { error: "round out of range" });
    if (round > current) {
      return send(res, 425, { error: `round ${round} not emitted yet: too early (current ${current})`, round, current });
    }
    return send(res, 200, beaconJson(round), "public, max-age=31536000, immutable");
  }
  return send(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (e) {
    send(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(
    `Relais beacon local sur http://127.0.0.1:${port} (chaîne ${info.hash.slice(0, 16)}..., période ${info.period} s, genesis ${info.genesis_time}${created ? ", nouvelle clé" : ", clé existante"})`,
  );
});

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
