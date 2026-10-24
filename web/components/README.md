# Web components: building blocks for the role pages

Osen look (Inter, solar duotone icons, cards without border, soft badges). Markup patterns come from the Osen
catalogue (`osen-ref/CATALOGUE.md`); prefer these blocks over new markup. All strings go through `t()` (`lib/dict.ts`).

## Shell and role model

- `Page({ title, intro?, needsConfig? })` (`Shell.tsx`): Osen frame. With a loaded config the whole page sits in a
  `PhaseProvider`, so the topbar stepper and the page share one beacon clock and one chain snapshot.
- **Actor**: `useApp().role` is the one source of truth (`useActor()` derives the wallet from it). Role keys:
  `office`, `committee-N` (N = set index, reserve included), `centre-N` (index in demo-state), `juror`.
  On `/public/` the actor is always the juror (no key), whatever was picked: public actions sign with the node signer.
- `ActingAs` (topbar chip, `data-testid="acting-as"`): grouped picker (Office, Committees, Centres, Public).
  Picking a role there routes to its page (`KIND[kind].href`). Inside the open menu, `<select data-testid="role">`
  changes the signer only and stays on the page (tests: click `acting-as` first, then `selectOption`).
- `RolePicker({ kinds?, testId?, label? })` (`Header.tsx`): plain select of the roles of these kinds, never routes.
  Test id defaults to `role-${kinds.join("-")}`, so `kinds={["committee"]}` is `role-committee` and
  `kinds={["centre"]}` is `role-centre`; option values as above. Pages that need a committee or a centre render it
  as their first step when the actor does not fit, and keep it reachable (compact) when it fits, so tests can switch.
- `KIND[kind]` gives `{ href, icon, ti, title, sub }`; `DUE[phase]` the role kind whose work is due now.

## Network layer (demo and live)

Pages never branch on the network: they use `useConfig()`, `useApp().role`, `useActor().wallet`, `usePhase()` and the
lib readers below. Only a few live-only flows check `cfg.mode` (centre key and join steps, operator registration,
freeze with keys, on-chain package publish).

| Concern | Demo (`cfg.mode === "demo"`) | Live (`"live"`, Base Sepolia + drand quicknet) |
|---|---|---|
| Config | `/config.json` from `make demo` (`lib/config.ts`) | `/config.live.json` (committed, `scripts/live-config.mjs`) + session, built by `lib/live.ts` into the same `AppConfig` shape |
| Mode, session | `sealhour.mode` = demo (default) | `sealhour.mode` = live; `sealhour.testnet.session` = `{ kind: "wallet" }` (shared registry) or `{ kind: "solo" }` (burners) |
| Read provider | `getProvider(cfg)`: JsonRpcProvider on the local node | `getProvider(cfg)`: failover JSON-RPC over `cfg.rpcUrls` (publicnode, then sepolia.base.org), 1 s polling |
| Signer | `useActor()`: demo wallet, office via the node's unlocked account | burner `Wallet` (solo) or the connected wallet's `JsonRpcSigner` (only on chain 84532 and for the role's own address) |
| Roles | `listRoles(cfg)` from demo-state | `liveRoles()`: solo = burner personas, centres resolved on chain by operator; wallet = `office()`, `committeesOf` (reserve included), centre operator via `allCentres` + `getCentre`, then juror |
| Beacon | `httpBeaconClient(beaconUrl, pin)` on the local relay | `relayClient(beaconUrls, pin)`: api, api2, api3.drand.sh, drand.cloudflare.com in order; 425 and 404 = too early; Cloudflare never asked for a future round; no custom header, cache buster |
| Packages | `fetchCentreCiphertext(cfg, ref, centreId)` and `fetchPublicCopy(cfg, ref)` with `ref = { examId, setIndex, uri, root }`: relative uri = static files under `packagesBaseUrl` | uri `"chain:"`: `readChainBundle()` reads `PackageData` logs on exactly the blocks of `packageDataBlocks` and runs every check of `scripts/lib.mjs readPackageBundle`; committees publish with `postPackageData` then `submitPackage(root, "chain:")` |
| Centre identity, r_c | from demo-state | generated on the device (`CentreKeyStep`), downloadable `.agekey` file, importable; stored under `sealhour.testnet.identity.*` and `sealhour.testnet.rc.*` |
| Snapshot | `readSnapshot()` = one `examSnapshot` call (both modes); `readAllCentres()` = `allCentres` view. No log scan from block 0 anywhere. | same |

Wallets (`lib/wallet.ts`): EIP-6963 discovery (fallback `window.ethereum`), `eth_requestAccounts`, switch or add Base
Sepolia (EIP-3326 / EIP-3085), `accountsChanged` / `chainChanged` / `disconnect`. `useApp().live` exposes `wallets`,
`wallet`, `connect`, `disconnect`, `switchChain`, `setSession`, `refresh` (re-read chain-derived roles).
Login page: `components/login/Login.tsx` (test ids `enter-demo`, `wallet`, `enter-shared`, `solo-start`, `solo-continue`,
`return-funds`, `export-burners`, `forget-burners`, `logout`). Live banner: `data-testid="live-banner"`, registry link
`registry-link`; topbar badge `live-badge` (demo keeps `demo-badge`); tx outcomes link the explorer (`tx-link`).
The Acting-as menu ends with "Switch mode or log out" (`switch-mode`, to `/login/`).

## Phase

`usePhase()` (`lib/usePhase.tsx`, only below `Page` with a config) returns
`{ phase, b, snap, loading, error, reload, milestones, next, leftMs, sealed, packages, burned }`.
`phase`: `setup | sealing | open | revealed | reserve`. `milestones`: the four rounds `{ key, label, round, atMs, reached }`.
`next`/`leftMs`: next milestone and the countdown to it. `reload()` re-reads the snapshot (the stepper's Refresh).
It covers the demo exam only; pages with a custom exam id keep their own `useSnapshot`.
`useOptionalPhase()` returns null outside the provider. `examMilestones(cfg, b, exam)` and `phaseOf(snap, round)` are exported.

`PhaseStepper` (topbar): List frozen, Sealed n/m, Opening, Reveal, Reserve, countdown on the current step,
info popover (`data-testid="phase-details"`) with the beacon round, relay status, round numbers and Refresh
(`data-testid="refresh"`). Pages no longer need BeaconBar, Refresh or a countdown bar of their own.

## Blocks (`blocks.tsx`)

| Component | Props | Notes |
|---|---|---|
| `StepList` | children: `Step`s | Numbered rail; numbers follow the order (CSS counter). |
| `Step` | `id?, title, state: "done"\|"current"\|"future", summary?, opensAt? (ms), aside?, children` | done: collapsed to `summary` with a check; current: open; future: greyed, "Opens at 14:32". Header button toggles (aria-expanded), body stays mounted (`hidden`). `id` keeps `#register`, `#freeze`... and the h2 id `${id}-title`. |
| `VerifyDetails` | `title?` (default "Verify it yourself"), `defaultOpen?, testId?, children` | Closed collapsible for every technical thing (hex, roots, files, JSON, HTTP status). |
| `Protected` | `children, title?` ("Protected."), `testId?` | Expected refusal = the protection worked. Shield icon, success tone, classes `notice notice-ok`. |
| `TxStep<T>` | `label, run, onDone?, disabled?, disabledReason?, confirm?, confirmLabel?, variant?, testId?, outcome?, children` | Button + error (`data-testid="error"`) + outcome (TxOutcome by default, `notice-ok`), bare, to put in a `Step`. `confirm` asks inline first (focus moves into the question, then to the outcome or back to the button); confirm button test id `${testId}-confirm`. Pass the time it opens as `disabledReason`. |
| `EmptyState` | `icon?, title, body?, action?` | Osen composed empty state. |
| `StatWidget` | `label, value, icon, tone?, sub?, testId?` | Osen centered stat card (index.php). |
| `FrozenList` | `centres, frozen, count, announced, listRoot?, participations?, selectable?, selected?, onToggle?, tableTestId?` | Visible summary line with `chain-count` / `announced-count`; table and list fingerprint in VerifyDetails. `selectable` shows the tick table directly (freeze step). `participations` adds Joined. `inline` shows the table directly (inside a block that is already collapsible). |
| `Timeline` | `items: { label, atMs, round?, state, note? }[]` | Osen timeline-alt. Use `usePhase().milestones` or a preview of rounds. |
| `TryOpen` | `round, atMs, reached, buttonLabel, attempt, explain?, openedMessage, testId? ("try-early"), resultTestId? ("too-early"), statement?` | One "no key before T" block for centre and juror. Statement line (`no-key`), try button, refusal as `Protected`, relay check (`relay-status`) in VerifyDetails. `attempt` resolves if it opened, throws otherwise. `children` render between the statement and the button. |
| `Countdown` | `label, atMs, nowMs, reached, reachedLabel, testId? ("countdown")` | Big countdown hero (role timer, not announced each second). |
| `ExamTimeline` | none | Card "Exam timeline" from `usePhase().milestones` (below a Page with a config). |
| `DrawResult` | `drawnSet, burned, setCount, reserve?, testId?` | Text "Drawn set: A" / "Reserve set R", burned skipped; `notice notice-ok`. |

Older pieces still in `ui.tsx` (`Notice`, `ErrorBox`, `Button`, `Hex`, `Chip`, `TxOutcome`, `Field`, `Loading`).

## Icons

- Small inline icons and the sidenav: Tabler webfont, `<i className="ti ti-NAME" aria-hidden="true" />`.
- Widget icons: `<Icon name="shield-check-bold-duotone" className="fs-22" />` (`Icon.tsx`), solar duotone, offline.
  To add one: append its name to `NAMES` in `scripts/icons.mjs`, run `node scripts/icons.mjs` (rewrites
  `components/icon-data.json`), then use it; `IconName` is typed from that file. Names: icon-sets.iconify.design/solar.
- Inside avatars: `<span className="avatar-title bg-primary-subtle text-primary rounded-circle fs-22"><Icon .../></span>`.

## Credits and licences

- Solar icon set by 480 Design (https://github.com/480-Design/Solar-Icon-Set), licensed under CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). The subset in `components/icon-data.json` is extracted
  unchanged from `@iconify-json/solar`. The app footer carries the attribution (`footer.credits` in `lib/dict.ts`).
- Inter typeface by The Inter Project Authors (https://github.com/rsms/inter), SIL Open Font License 1.1,
  bundled from `@fontsource-variable/inter`.

## Copy

Plain words by default ("opening time", "SMS code", "list fingerprint", "centre secret"); technical names only
inside `VerifyDetails` or tooltips. The redesign keys are in the "UX redesign" block at the end of `lib/dict.ts`.
