// Writes the committed public files of live mode, no secret in them:
//   web/public/config.live.json   shared registry on Base Sepolia (address, deploy block, office), ABI and creation
//                                 bytecode (the solo test deploys its own registry), public RPCs, drand quicknet relays
//   web/public/live/sets/         the five sample exam sets (committee drafts in live mode)
// Inputs: ../shared/deployment.base-sepolia.json (written by contracts/scripts/deploy.js) and the Hardhat artifact.
// Usage: node scripts/live-config.mjs   (after `npx hardhat compile` in contracts/)
import fs from "node:fs";
import path from "node:path";
import { demoSet, SET_LABELS } from "../../scripts/demo-sets.mjs";

const web = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const app = path.join(web, "..");
const dep = JSON.parse(fs.readFileSync(path.join(app, "shared", "deployment.base-sepolia.json"), "utf8"));
const art = JSON.parse(fs.readFileSync(path.join(app, "contracts", "artifacts", "contracts", "SealRegistry.sol", "SealRegistry.json"), "utf8"));
if (dep.chainId !== 84532) throw new Error(`expected a Base Sepolia deployment, got chainId ${dep.chainId}`);
if (JSON.stringify(dep.abi) !== JSON.stringify(art.abi)) throw new Error("the deployment ABI differs from the compiled artifact: recompile or redeploy");

const relays = ["https://api.drand.sh", "https://api2.drand.sh", "https://api3.drand.sh", "https://drand.cloudflare.com"];
const config = {
  chainId: 84532,
  chainName: "Base Sepolia",
  rpcUrls: ["https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org"],
  beaconUrls: relays.map((r) => `${r}/${dep.beaconChainHash}`),
  explorer: "https://sepolia.basescan.org",
  registry: { address: dep.address, deployBlock: dep.deployBlock, office: dep.office },
  genesisTime: dep.genesisTime,
  period: dep.period,
  beaconChainHash: dep.beaconChainHash,
  beaconPublicKey: dep.beaconPublicKey,
  abi: art.abi,
  bytecode: art.bytecode,
};
fs.writeFileSync(path.join(web, "public", "config.live.json"), JSON.stringify(config) + "\n");
const sets = path.join(web, "public", "live", "sets");
fs.mkdirSync(sets, { recursive: true });
SET_LABELS.forEach((label, i) => fs.writeFileSync(path.join(sets, `set-${i}.json`), JSON.stringify(demoSet(label), null, 2) + "\n"));
console.log(`wrote public/config.live.json (registry ${dep.address}) and ${SET_LABELS.length} sets in public/live/sets/`);
