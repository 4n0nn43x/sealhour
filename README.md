# SealHour

SealHour seals national exam papers under a double lock: a drand timelock (no key exists anywhere before the opening round) and the X25519 key of each exam centre.
A centre can open its copy only after the round falls, with candidates already confined in the room; nobody else can open it before the reveal round. After the reveal round a public copy of every set opens for everyone, by design (so anyone can check the draw and the leak verdicts).
A public registry on chain freezes the list of centres, records the sealed packages and burned sets, and makes a leak attributable to a committee or a centre.

## Architecture

```
app/
  Makefile            install | test | demo | demo-cli | e2e | clean
  contracts/          Hardhat 2, SealRegistry.sol (Solidity 0.8.26 via solc-js), 64 tests, scripts/deploy.js
  packages/seal/      TypeScript core (tlock-js 0.9.0 + age-encryption 0.3.1): seal/open, draw, fingerprint,
                      Merkle, base32, leak verifier. Node 22 and browser. 39 tests (vitest)
  scripts/            beacon-server.mjs (local drand compatible relay), seed-demo.mjs, demo-cli.mjs
  shared/             generated, gitignored except README: deployment.json, beacon-info.json, beacon-key.json,
                      demo-state.json (demo keys), sets/, packages/<examId>/ (sealed files, plan B for IPFS)
  web/                Next.js 14 static export, English. Pages: /enrolment /committee /centre /public
                      scripts/serve.mjs (static server, /shared/ falls back to app/shared), smoke.mjs, e2e-live.mjs
```

There is no application backend. The only server is the beacon relay. The browser talks to the chain over JSON-RPC (ethers 6) and reads `/config.json` = `{ deployment, demo, beaconUrl, packagesBaseUrl: "/shared" }`, written by `make demo` from `shared/deployment.json` and `shared/demo-state.json`.

## The double lock

Each committee seals its set in its own browser, once per centre:

```
ciphertext_c = tlock(open_round, age(X25519_key_of_centre_c, exam_set))
```

- The outer tlock layer opens only with the drand signature of `open_round`. That signature is produced by the threshold network (League of Entropy on quicknet) when the round falls: before that, no key exists, for anyone, with no override.
- The signature is public. The inner age layer is what keeps a juror or a network holding the file out: only the centre's private key opens it.
- On opening, the drawn set is chosen from the signature among the sets not burned (`burnSet`, at least one round before the opening round) and with a package on chain, the paper is rendered with a fingerprint derived from `H(centreId, r_c, signature)` (`r_c` committed, unique per exam, and tlocked to the reveal round), and three record copies are designated by index.
- After the reveal round, everyone can open every set and every `r_c`: the dated verifier attributes a text seen before its set's opening (the reserve has its own) to its committee, a fingerprinted text seen between T and the reveal round to its centre, otherwise "unattributed" (from the reveal round on, anyone can compute any rendering).
- The beacon is pinned: `deploy.js` stores the chain hash and public key of `shared/beacon-info.json` in the contract (`beaconChainHash`, `beaconPublicKey`) and in `deployment.json`; the scripts and the web refuse a relay whose `/info` differs.

## Prerequisites

- Node 22 (tested with v22.22.0), npm 10 or later (npm 9 rejects the lockfiles: use `npx -y npm@10 ci` if needed), GNU make, bash.
- Playwright with Chromium for `make test` (smoke) and `make e2e`. The scripts use a local `playwright` package if present, otherwise the global one (`npm i -g playwright && npx playwright install chromium`).
- Free local ports: 8545 (Hardhat), 8787 (beacon), 3000 (web, `make demo`), 3123 (smoke), 3124 (e2e). Targets refuse to start when a port is busy.

## Commands

All commands run from `app/`.

| Command | What it does |
|---|---|
| `make install` | `npm ci` in contracts, packages/seal (then builds `dist/`), scripts, web (the web links the built seal module). |
| `make test` | Contract tests (64), seal build + typecheck + tests (39), web typecheck + static build + browser smoke (pages without config, seal self test in the browser, pages with chain and relay down). |
| `make demo` | Browser demo on a fresh local stack, runs until Ctrl+C (see below). |
| `make demo-cli` | Same story without a browser: beacon period 1 s, opening in 20 s, 40 checks, prints `RESULT: OK (40/40 checks passed)`. |
| `make e2e` | Same stack as `make demo`, short (period 1 s, opening in 75 s), then `web/scripts/e2e-live.mjs` drives the four screens in Chromium (33 checks, about 2 min 10 s). Fails if any check fails. Prints `E2E OK`. |
| `make clean` | Removes everything generated in `shared/` (except README.md), `web/out/` and `web/public/config.json`. |

Overrides: `make demo DEMO_OPEN_IN=180`, `DEMO_PERIOD`, `E2E_OPEN_IN`, `E2E_PERIOD`, `RPC_PORT`, `BEACON_PORT`, `WEB_PORT`. Logs go to `shared/hardhat-node.log`, `shared/beacon.log`, `shared/web.log`.

### `make demo`

Starts a Hardhat node and the local beacon (period 3 s, new key with `--reset`), deploys `SealRegistry` with the beacon genesis and period, seeds the "Regional mock mathematics exam" (4 centres Northgate, Riverside, Eastport, Hillcrest; committees A to D; reserve committee R; opening in 240 s), writes `web/public/config.json`, builds the web if `web/out/` is missing, serves it on http://127.0.0.1:3000, then prints the URLs and the round times:

```
  Home        http://127.0.0.1:3000/
  Enrolment   http://127.0.0.1:3000/enrolment/    (exam office: centres, frozen list, phantom centre refused)
  Committee   http://127.0.0.1:3000/committee/    (committees A to D and R: seal in the browser, burn a set)
  Centre      http://127.0.0.1:3000/centre/       (centre heads: key check, signature, offline opening, print)
  Public      http://127.0.0.1:3000/public/       (anyone, juror: no key before T, reveal, leak verifier)
Round times (beacon period 3 s):
  open           round 82  at 2:50:31 AM  (in 233 s)
  reveal         round 102  at 2:51:31 AM  (in 293 s)
  reserveOpen    round 122  at 2:52:31 AM  (in 353 s)
  reserveReveal  round 142  at 2:53:31 AM  (in 413 s)
Press Ctrl+C to stop.
```

Each page has a role selector (demo wallets from `demo-state.json`). Ctrl+C stops the node, the beacon and the web server. The seed cannot run twice on the same contract: every `make demo` starts a fresh chain.

### Final demo walkthrough (4:30 script, docs/smu/32 section 9)

| Time | Script | Where |
|---|---|---|
| 0:00, 0:40 | Hazaribagh 2024, bank time locks | Slides, no screen |
| 1:10 | Frozen list of 4 centres, four committees seal, opening in 2 minutes | `/enrolment/` (frozen list), `/committee/` as committee C: list matches the announced count, seal in the browser (the seed already submitted, the chain answers AlreadyDone); `/public/` countdown and "no key exists before round N" (relay answers 425). Transactions go to local Hardhat, not Base Sepolia (see plan B). |
| 1:40 | A juror downloads the Northgate package and fails; a fifth centre is refused | `/public/` "Juror: take the paper", download, try to open: "Too early". `/enrolment/` "Try to add a phantom centre": refused (AlreadyDone, KeyFrozen). |
| 3:10, staged before T | Committee C saw its set on Telegram: it burns it | `/committee/` as committee C, "Burn my set" (must be done at least one round before the opening round; after that the chain says TooLate). |
| 2:20 | The round falls. Juror: "valid signature, you are not a centre". Hillcrest, offline, pastes the signature, draws set B, prints with its fingerprint | `/public/` juror open after T. `/centre/` as Hillcrest: fetch the signature (base32 shown), then "Offline (SMS)", paste the base32, open: drawn set avoids C, fingerprinted paper, record copy indexes. |
| 3:10 | The draw avoided C. Verifier: photo (centre 2), text before T (committee C), retyped after T (unattributed) | `/public/` after the reveal round (open + 60 s): reveal sets and `r_c`, then the three verifier presets; flag a centre. |
| 4:00 | Limits, kit cost, pilot | Slides; reserve mode shown in `/centre/` after the reserve round if time allows. |

The drawn set comes from the signature, so it is not always B; the script line is a narration of one run.

## Sandbox limitations and plan B

The cloud sandbox blocks `api.drand.sh`, `sepolia.base.org` and the solc binary CDN. The build therefore runs with:

- **Local drand compatible beacon** instead of quicknet: `scripts/beacon-server.mjs` signs rounds with the same scheme (`bls-unchained-g1-rfc9380`) and the same HTTP API (`/info`, `/public/latest`, `/public/{round}`, 425 for future rounds), with a generated BLS key in `shared/beacon-key.json`.
- **Local Hardhat node** instead of Base Sepolia (interval mining, 1 block per second, timestamps aligned to the wall clock; set by seed-demo).
- **solc-js 0.8.26 from npm** instead of Foundry; **static files in `shared/packages/`** instead of IPFS (integrity by the Merkle root on chain).

### Switching to drand quicknet and Base Sepolia (not verified here: network blocked)

1. Beacon: do not start `beacon-server.mjs`. Save the real chain info: `curl -s $BEACON_URL/info > shared/beacon-info.json` with `BEACON_URL=https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` (quicknet: genesis 1692803367, period 3 s, as in tlock-js defaults).
2. Chain (`deploy.js` pins the hash and public key of `shared/beacon-info.json` in the contract): put `RPC_URL` and `DEPLOYER_KEY` (throwaway testnet key) in `.env` (see `.env.example`), export them, then `cd contracts && BEACON_GENESIS=1692803367 BEACON_PERIOD=3 npx hardhat run scripts/deploy.js --network baseSepolia`.
3. Seed with `node scripts/seed-demo.mjs --beacon $BEACON_URL --rpc $RPC_URL`, and write `web/public/config.json` as `make demo` does. Limitation: `seed-demo.mjs` funds its demo wallets and signs as the office through the node's unlocked account 0, so on Base Sepolia it needs a signer change first; the web reads the beacon URL from `demo-state.json` (`beaconUrl`).

For the local stack the Makefile ignores `BEACON_URL`, `RPC_URL` and `DEPLOYER_KEY`.

## Security notes

- Demo keys are throwaway: wallet keys, centre age identities and the beacon secret are generated per run and live only in `app/shared/` (gitignored except its README) and in `web/public/config.json` (gitignored). They are served to the browser on purpose, for the demo roles. Never reuse them.
- No mnemonic or office key is stored: the office signs through the Hardhat node's unlocked account 0 (scripts and web), and `demo-state.json` holds `office.privateKey: null`.
- Never commit `.env`. It is gitignored; `.env.example` holds placeholders only. Use a testnet-only key for `DEPLOYER_KEY`.

## Known limits (docs/smu/32 section 4)

- At opening, each centre holds the plaintext for about 30 minutes, with candidates already confined and phones deposited.
- A committee member keeps knowledge of their own set; four independent committees and `burnSet` reduce, not remove, that risk.
- A hidden device in the room during the exam remains a risk that SealHour does not address.
- SealHour shrinks the exposure window from days to 30 minutes of confinement, removes the override, and makes a leak attributable when the evidence exists (a fingerprint can be avoided by a copy printed without it).
