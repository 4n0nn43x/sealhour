# SealHour build and demo targets (run from app/).
#   make install    npm ci in contracts, packages/seal (then build dist/), scripts, web
#   make test       contract tests, seal build + typecheck + tests, web typecheck + build + smoke
#   make demo       browser demo: local Hardhat node + local beacon relay (period 3 s), deploy, seed
#                   (opening in DEMO_OPEN_IN=240 s), web on http://127.0.0.1:3000. Ctrl+C stops everything.
#   make demo-cli   end to end demo without a browser: local Hardhat node + local beacon relay
#                   (period 1 s), deploy, seed (opening in 20 s), replay the final demo script.
#                   Logs in shared/hardhat-node.log and shared/beacon.log. Exit code = demo-cli's.
#   make e2e        same stack as demo but short (period 1 s, opening in E2E_OPEN_IN=75 s), then the
#                   live browser test web/scripts/e2e-live.mjs. Fails if any check fails.
#   make clean      remove generated files: app/shared (except README.md), web/out, web/public/config.json
# Overrides: DEMO_OPEN_IN, DEMO_PERIOD (demo and demo-cli), E2E_OPEN_IN, E2E_PERIOD, RPC_PORT, BEACON_PORT, WEB_PORT.
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.ONESHELL:

RPC_PORT ?= 8545
BEACON_PORT ?= 8787
WEB_PORT ?= 3000
# DEMO_PERIOD and DEMO_OPEN_IN keep their demo-cli defaults (1 s, 20 s) and get browser demo defaults (3 s, 240 s).
CLI_PERIOD = $(or $(DEMO_PERIOD),1)
CLI_OPEN_IN = $(or $(DEMO_OPEN_IN),20)
WEB_DEMO_PERIOD = $(or $(DEMO_PERIOD),3)
WEB_DEMO_OPEN_IN = $(or $(DEMO_OPEN_IN),240)
E2E_PERIOD ?= 1
E2E_OPEN_IN ?= 75
# web/scripts/e2e-live.mjs serves the site itself on this fixed port.
E2E_WEB_PORT := 3124

.PHONY: help install test demo demo-cli e2e clean

help:
	@sed -n '1,12p' Makefile

# Recipes run as one bash script each (.ONESHELL): every step is a subshell so cd does not leak.
install:
	(cd contracts && npm ci)
	(cd packages/seal && npm ci && npm run build)
	(cd scripts && npm ci)
	(cd web && npm ci)

# smoke.mjs first checks the "no config.json" state: a public/config.json left by `make demo` is
# copied into out/ by the build, so it is removed from out/ (make demo copies it back).
test:
	(cd contracts && npx hardhat test)
	(cd packages/seal && npm run build && npm run typecheck && npm test)
	(cd web && npm run typecheck && npm run build && rm -f out/config.json && npm run smoke)

demo-cli:
	@mkdir -p shared
	port_busy() { (exec 3<>/dev/tcp/127.0.0.1/$$1) 2>/dev/null; }
	wait_port() { for _ in $$(seq 1 120); do port_busy $$1 && return 0; sleep 0.5; done; echo "port $$1 not ready" >&2; return 1; }
	for p in $(RPC_PORT) $(BEACON_PORT); do
	  if port_busy $$p; then echo "port $$p already in use: stop the process listening on it first" >&2; exit 1; fi
	done
	pids=()
	cleanup() { for pid in "$${pids[@]}"; do kill "$$pid" 2>/dev/null || true; done; wait 2>/dev/null || true; }
	trap cleanup EXIT
	(cd contracts && exec ./node_modules/.bin/hardhat node --port $(RPC_PORT)) > shared/hardhat-node.log 2>&1 &
	pids+=($$!)
	(cd scripts && exec node beacon-server.mjs --period $(CLI_PERIOD) --port $(BEACON_PORT) --reset) > shared/beacon.log 2>&1 &
	pids+=($$!)
	wait_port $(RPC_PORT)
	wait_port $(BEACON_PORT)
	cat shared/beacon.log
	genesis=$$(node -p 'require("./shared/beacon-info.json").genesis_time')
	period=$$(node -p 'require("./shared/beacon-info.json").period')
	(cd contracts && BEACON_GENESIS=$$genesis BEACON_PERIOD=$$period LOCAL_RPC_URL=http://127.0.0.1:$(RPC_PORT) \
	  npx hardhat run scripts/deploy.js --network localhost)
	(cd scripts && node seed-demo.mjs --open-in $(CLI_OPEN_IN) --beacon http://127.0.0.1:$(BEACON_PORT))
	(cd scripts && node demo-cli.mjs)

# Shared by demo and e2e. $(1) = beacon period, $(2) = seconds until the opening round, $(3) = extra
# ports that must be free. Starts the Hardhat node and the beacon relay in the background (killed by
# the EXIT trap), deploys with the beacon genesis and period, seeds, writes web/public/config.json.
define START_STACK
mkdir -p shared
port_busy() { (exec 3<>/dev/tcp/127.0.0.1/$$1) 2>/dev/null; }
wait_port() { for _ in $$(seq 1 120); do port_busy $$1 && return 0; sleep 0.5; done; echo "port $$1 not ready" >&2; return 1; }
for p in $(RPC_PORT) $(BEACON_PORT) $(3); do
  if port_busy $$p; then echo "port $$p already in use: stop the process listening on it first" >&2; exit 1; fi
done
pids=()
cleanup() { trap - EXIT INT TERM; for pid in "$${pids[@]}"; do kill "$$pid" 2>/dev/null || true; done; wait 2>/dev/null || true; echo "stopped: hardhat node, beacon relay$${web_pid:+, web server}"; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [ ! -f web/out/index.html ]; then (cd web && npm run build); fi
(cd contracts && exec ./node_modules/.bin/hardhat node --port $(RPC_PORT)) > shared/hardhat-node.log 2>&1 &
pids+=($$!)
(cd scripts && exec node beacon-server.mjs --period $(1) --port $(BEACON_PORT) --reset) > shared/beacon.log 2>&1 &
pids+=($$!)
wait_port $(RPC_PORT)
wait_port $(BEACON_PORT)
cat shared/beacon.log
genesis=$$(node -p 'require("./shared/beacon-info.json").genesis_time')
period=$$(node -p 'require("./shared/beacon-info.json").period')
(cd contracts && BEACON_GENESIS=$$genesis BEACON_PERIOD=$$period LOCAL_RPC_URL=http://127.0.0.1:$(RPC_PORT) \
  npx hardhat run scripts/deploy.js --network localhost)
(cd scripts && node seed-demo.mjs --open-in $(2) --beacon http://127.0.0.1:$(BEACON_PORT))
node -e 'const fs = require("fs"); const read = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
  const demo = read("shared/demo-state.json");
  const config = { deployment: read("shared/deployment.json"), demo, beaconUrl: demo.beaconUrl, packagesBaseUrl: "/shared" };
  fs.writeFileSync("web/public/config.json", JSON.stringify(config, null, 2) + "\n");'
echo "wrote web/public/config.json"
endef

demo:
	@$(call START_STACK,$(WEB_DEMO_PERIOD),$(WEB_DEMO_OPEN_IN),$(WEB_PORT))
	cp web/public/config.json web/out/config.json
	node web/scripts/serve.mjs web/out $(WEB_PORT) shared > shared/web.log 2>&1 &
	web_pid=$$!
	pids+=($$web_pid)
	wait_port $(WEB_PORT)
	base=http://127.0.0.1:$(WEB_PORT)
	echo
	echo "SealHour demo is up (logs: shared/hardhat-node.log, shared/beacon.log, shared/web.log)"
	echo "  Home        $$base/"
	echo "  Enrolment   $$base/enrolement/   (exam office: centres, frozen list, phantom centre refused)"
	echo "  Committee   $$base/comite/       (committees A to D and R: seal in the browser, burn a set)"
	echo "  Centre      $$base/centre/       (centre heads: key check, signature, offline opening, print)"
	echo "  Public      $$base/public/       (anyone, juror: no key before T, reveal, leak verifier)"
	echo "  Chain RPC   http://127.0.0.1:$(RPC_PORT)   Beacon relay http://127.0.0.1:$(BEACON_PORT)"
	echo "Round times (beacon period $$period s):"
	node -e 'const i = require("./shared/beacon-info.json"), s = require("./shared/demo-state.json");
	  for (const [k, r] of Object.entries(s.rounds)) {
	    const t = (i.genesis_time + (r - 1) * i.period) * 1000;
	    console.log(`  $${k.padEnd(14)} round $${r}  at $${new Date(t).toLocaleTimeString()}  (in $${Math.round((t - Date.now()) / 1000)} s)`);
	  }'
	echo "Press Ctrl+C to stop."
	rc=0
	wait -n "$${pids[@]}" || rc=$$?
	echo "a background service stopped (code $$rc): see the logs in shared/" >&2
	exit 1

e2e:
	@$(call START_STACK,$(E2E_PERIOD),$(E2E_OPEN_IN),$(E2E_WEB_PORT))
	(cd web && node scripts/e2e-live.mjs public/config.json ../shared)

clean:
	find shared -mindepth 1 -maxdepth 1 ! -name README.md -exec rm -rf {} +
	rm -rf web/out web/public/config.json
