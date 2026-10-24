# SealHour

SealHour seals national exam papers under a double lock: a drand timelock (no key exists anywhere before the opening round) and the X25519 key of each exam centre.
A centre can open its copy only after the round falls, with candidates already confined in the room; nobody else can open it before the reveal round. After the reveal round a public copy of every set opens for everyone, by design (so anyone can check the draw and the leak verdicts).
A public registry on chain freezes the list of centres, records the sealed packages and burned sets, and makes a leak attributable to a committee or a centre.

## Architecture

```
app/
  Makefile            install | test | demo | demo-cli | e2e | e2e-testnet | clean
  contracts/          Hardhat 2, SealRegistry.sol (Solidity 0.8.26 via solc-js), 92 tests, scripts/deploy.js
  packages/seal/      TypeScript core (tlock-js 0.9.0 + age-encryption 0.3.1): seal/open, draw, fingerprint,
                      Merkle, base32, leak verifier. Node 22 and browser. 39 tests (vitest)
  scripts/            beacon-server.mjs (local drand compatible relay), seed-demo.mjs, demo-cli.mjs
  shared/             generated, gitignored except README: deployment.json, beacon-info.json, beacon-key.json,
                      demo-state.json (demo keys), sets/, packages/<examId>/ (sealed files, plan B for IPFS)
  web/                Next.js 14 static export, English. Pages: /login /enrolment /committee /centre /public
                      scripts/serve.mjs (static server, /shared/ falls back to app/shared), smoke.mjs, e2e-live.mjs,
                      e2e-testnet.mjs (live test on Base Sepolia), live-config.mjs (writes public/config.live.json)
```

There is no application backend. In demo mode the only server is the local beacon relay. The browser talks to the chain over JSON-RPC (ethers 6) and reads `/config.json` = `{ deployment, demo, beaconUrl, packagesBaseUrl: "/shared" }`, written by `make demo` from `shared/deployment.json` and `shared/demo-state.json`. In live mode it reads the committed `/config.live.json` instead and needs no server of its own (see "Modes" below).

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
- Free local ports: 8545 (Hardhat), 8787 (beacon), 3000 (web, `make demo`), 3123 (smoke), 3124 (e2e), 3125 (e2e-testnet). Targets refuse to start when a port is busy.

## Commands

All commands run from `app/`.

| Command | What it does |
|---|---|
| `make install` | `npm ci` in contracts, packages/seal (then builds `dist/`), scripts, web (the web links the built seal module). |
| `make test` | Contract tests (92), seal build + typecheck + tests (39), web typecheck + static build + browser smoke (pages without config, seal self test in the browser, pages with chain and relay down). |
| `make demo` | Browser demo on a fresh local stack, runs until Ctrl+C (see below). |
| `make demo-cli` | Same story without a browser: beacon period 1 s, opening in 20 s, 40 checks, prints `RESULT: OK (40/40 checks passed)`. |
| `make e2e` | Same stack as `make demo`, short (period 1 s, opening in 75 s), then `web/scripts/e2e-live.mjs` drives the four screens in Chromium (33 checks, about 2 min 10 s). Fails if any check fails. Prints `E2E OK`. |
| `make e2e-testnet` | Live test on Base Sepolia and drand quicknet, real transactions (see "Live testnet"). Needs `.env` with a funded `DEPLOYER_KEY`; prints `E2E TESTNET OK`, the transactions with explorer links and the cost. |
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

### Web front: icons and link previews

The static export ships a favicon, app icons, a web manifest and a 1200x630 link preview image (`web/app/icon.svg`, `favicon.ico`, `apple-icon.png`, `manifest.json`, `opengraph-image.png`, `twitter-image.png`). They are committed; `node web/scripts/brand.mjs` regenerates them from the logo definition (Playwright Chromium).

Link previews need absolute URLs, so set the public origin at build time when deploying:

```
cd web && NEXT_PUBLIC_SITE_URL=https://sealhour.example.org npm run build
```

`NEXT_PUBLIC_SITE_URL` (no trailing path) becomes the `metadataBase` of `web/app/layout.tsx`: `og:image`, `twitter:image` and `og:url` start with it. Unset, it defaults to `http://localhost:3000` (the port of `npm run serve`), which is fine locally but gives previews nobody else can load.

## Modes: demo and live testnet

The login page `/login/` (also "Switch mode or log out" in the topbar's Acting-as menu) has two doors. The choice
persists in the browser (`sealhour.mode`); the topbar shows a "demo mode" or "live: Base Sepolia" badge, and live mode
adds a permanent banner with the registry address linked to the explorer. Pages are the same in both modes: a network
layer (`web/components/README.md`, "Network layer") picks the RPC, signer, beacon relays, package store and roles.

- **Demo** (default): local Hardhat chain, local beacon relay, demo personas from `/config.json`. Unchanged; it works
  without visiting the login page whenever `/config.json` is present (`make demo`). Without it, the page explains `make demo`.
- **Live testnet**: Base Sepolia (chain 84532) and drand quicknet. Connect a browser wallet (EIP-6963 discovery,
  switch or add Base Sepolia), then either:
  - **Use the shared registry**: roles come from chain state for the connected address: office (`office()`),
    committee (`committeesOf(examId)`, reserve included), centre operator (`allCentres` + `getCentre`), else public.
  - **Solo live test**: one person plays every role in real time. The wallet sends one funding transaction to an office
    test wallet, which pays 10 other test wallets (committees A to D, reserve R, 4 centres, juror) and deploys a fresh
    `SealRegistry` pinned to drand quicknet. The total is shown before confirming; "Return leftover funds" sends what
    is left back to the wallet. The test wallet keys, centre keys and `r_c` live in this browser's localStorage under
    `sealhour.testnet.` (Base Sepolia only, refused on any other chain), with "Export the keys" and "Forget these wallets".

Live flows that the demo seeds for you: the office registers centres by operator address (`registerCentreOperator`);
each centre creates its X25519 key on its device (downloadable `.agekey` file, importable), publishes it with
`setCentreKey`; the office freezes exactly the keys it reviewed (`freezeCentresWithKeys`); centres join with
`joinExam` (fresh `r_c`, tlocked to the reveal round); committees publish their sealed files on chain
(`postPackageData`, then `submitPackage(root, "chain:")`). Readers fetch them with `eth_getLogs` on exactly the
recorded blocks (`packageDataBlocks`) and check every leaf against the root on chain; nothing scans logs from block 0.
Beacon: api.drand.sh, api2, api3, then drand.cloudflare.com, pinned to quicknet; 425 and 404 mean "too early", and
Cloudflare (which caches a 404 for months) is never asked for a future round.

### Live testnet

- Shared registry: `0x95efB9D11336bF5b654E063634750DcFFC19B2Fe` on Base Sepolia (deploy block 49755175, office
  `0xAEF54de283ADDc2313C67b262dCe3c9e81B82866`, quicknet pin). Explorer:
  https://sepolia.basescan.org/address/0x95efB9D11336bF5b654E063634750DcFFC19B2Fe ,
  https://base-sepolia.blockscout.com/address/0x95efB9D11336bF5b654E063634750DcFFC19B2Fe . Sourcify (exact match):
  https://repo.sourcify.dev/84532/0x95efB9D11336bF5b654E063634750DcFFC19B2Fe
- `web/public/config.live.json` (committed, no secret): registry, ABI, creation bytecode (for the solo test deploy),
  read RPCs (`base-sepolia-rpc.publicnode.com`, then `sepolia.base.org`), drand relays. Regenerate it after a new
  deployment with `node web/scripts/live-config.mjs` (reads `shared/deployment.base-sepolia.json` and the compiled
  artifact; also writes the sample sets in `web/public/live/sets/`).
- Use it: `make demo` is not needed. `cd web && npm run build && npm run serve`, open http://127.0.0.1:3000/login/ with
  a wallet extension holding a little Base Sepolia ETH.
- Faucets: Coinbase CDP https://portal.cdp.coinbase.com/products/faucet (0.0001 ETH per request), Alchemy
  https://www.alchemy.com/faucets/base-sepolia , list https://docs.base.org/base-chain/tools/network-faucets .
- Costs (measured on Base Sepolia, 2026-10-24, about 0.006 gwei): one full solo run is 49 transactions, 10.5 M gas,
  **0.000067 ETH** spent (deploy 3.04 M gas; per set postPackageData 578 to 617 k + submitPackage 103 k; joinExam
  561 k per centre; freezeCentresWithKeys 373 k; registerCentreOperator 125 to 142 k; setCentreKey 52 k; createExam
  156 k; burnSet 59 k; flagCentre 32 k; L1 data fees below 0.0000001 ETH in total). The solo setup first sends about
  twice the budget (0.00025 ETH that day) and returns the rest at the end.
- `make e2e-testnet` runs the whole solo story headless against Base Sepolia and the real quicknet beacon (about
  8 minutes, opening 3 minutes after the exam is created, `E2E_OPEN_MIN` to change it). The funding key is
  `DEPLOYER_KEY` from `.env`, read in the recipe's shell only: the page talks to an injected EIP-1193 wallet answered
  in Node, so the key never reaches the browser, a file or a log. It prints every check, every transaction with its
  explorer link, the registry address and the cost, and returns leftovers. Free dry run on a local chain:
  `anvil --chain-id 84532 --port 8546`, then `E2E_LOCAL_RPC=http://127.0.0.1:8546 DEPLOYER_KEY=<an anvil test key>
  node web/scripts/e2e-testnet.mjs` (real quicknet, local chain, shared registry step skipped).

## Sandbox limitations and plan B

The cloud sandbox blocks `api.drand.sh`, `sepolia.base.org` and the solc binary CDN. The build therefore runs with:

- **Local drand compatible beacon** instead of quicknet: `scripts/beacon-server.mjs` signs rounds with the same scheme (`bls-unchained-g1-rfc9380`) and the same HTTP API (`/info`, `/public/latest`, `/public/{round}`, 425 for future rounds), with a generated BLS key in `shared/beacon-key.json`.
- **Local Hardhat node** instead of Base Sepolia (interval mining, 1 block per second, timestamps aligned to the wall clock; set by seed-demo).
- **solc-js 0.8.26 from npm** instead of Foundry; **static files in `shared/packages/`** instead of IPFS (integrity by the Merkle root on chain).

### Switching to drand quicknet and Base Sepolia (scripts; the web live mode is described above)

1. Beacon: do not start `beacon-server.mjs`. `BEACON_URL=https://api.drand.sh/52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971` (quicknet: genesis 1692803367, period 3 s, as in tlock-js defaults).
2. Chain: put `RPC_URL` and `DEPLOYER_KEY` (throwaway testnet key) in `.env` (see `.env.example`), export them, then `cd contracts && npx hardhat run scripts/deploy.js --network baseSepolia`. On chain 84532 (or with `BEACON=quicknet`) `deploy.js` ignores `BEACON_GENESIS`, `BEACON_PERIOD` and `shared/beacon-info.json`: it pins the quicknet constants hardcoded in the script (chain hash, public key, genesis, period), checks that they hash to the quicknet chain hash, and refuses to deploy if api.drand.sh, when reachable, serves anything else. Output: `shared/deployment.base-sepolia.json`.
3. Seed with `node scripts/seed-demo.mjs --beacon $BEACON_URL --rpc $RPC_URL`, and write `web/public/config.json` as `make demo` does. Limitation: `seed-demo.mjs` funds its demo wallets and signs as the office through the node's unlocked account 0, so on Base Sepolia it needs a signer change first; the web reads the beacon URL from `demo-state.json` (`beaconUrl`).

For the local stack the Makefile ignores `BEACON_URL`, `RPC_URL` and `DEPLOYER_KEY`.

### Live centre enrolment and freeze

On the live path each centre sets its own key, so the office must freeze exactly the keys it reviewed:

1. Office: `registerCentreOperator(centreId, operator, name)` for each centre (non zero `centreId`).
2. Each operator: `setCentreKey(centreId, key)` (its age X25519 recipient as bytes32). Zero reverts `BadList`, a low order X25519 point reverts `BadKey`.
3. Office: reads the keys (`getCentre`), checks them with the centres out of band, then `freezeCentresWithKeys(examId, centreIds, keys, listRoot, count)`. It reverts `KeyMismatch` if any current key differs from `keys[i]` (an operator rotated its key after the review): review again and retry. `listRoot` is still `keccak256(abi.encodePacked(centreIds))`, ids only; the frozen keys are read with `getCentre`.

`freezeCentres` (no keys) still works for keys set by the office with `registerCentre` (the local demo), and reverts `KeyMismatch` when a listed centre's key was set by its operator. `centreOfOperator` is a hint only: resolve roles from `examSnapshot` (or `allCentres` + `getCentre`).

## Security notes

- Demo keys are throwaway: wallet keys, centre age identities and the beacon secret are generated per run and live only in `app/shared/` (gitignored except its README) and in `web/public/config.json` (gitignored). They are served to the browser on purpose, for the demo roles. Never reuse them.
- No mnemonic or office key is stored: the office signs through the Hardhat node's unlocked account 0 (scripts and web), and `demo-state.json` holds `office.privateKey: null`.
- Live mode stores test wallet keys, centre identities and `r_c` in localStorage under `sealhour.testnet.` only, for
  Base Sepolia (84532) only; export and forget buttons are on the login page. The demo stores no key.
- Never commit `.env`. It is gitignored; `.env.example` holds placeholders only. Use a testnet-only key for `DEPLOYER_KEY`.

## Known limits

- At opening, each centre holds the plaintext for about 30 minutes, with candidates already confined and phones deposited.
- A committee member keeps knowledge of their own set; four independent committees and `burnSet` reduce, not remove, that risk.
- A hidden device in the room during the exam remains a risk that SealHour does not address.
- SealHour shrinks the exposure window from days to 30 minutes of confinement, removes the override, and makes a leak attributable when the evidence exists (a fingerprint can be avoided by a copy printed without it).
