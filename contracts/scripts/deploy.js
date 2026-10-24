// Deploys SealRegistry(genesisTime, period, beaconChainHash, beaconPublicKey) and writes ../shared/deployment.json.
// Usage: npx hardhat run scripts/deploy.js --network localhost
// Env: BEACON_GENESIS (unix seconds), BEACON_PERIOD (seconds, default 3).
// The beacon pin (chain hash, public key) is read from ../shared/beacon-info.json (required).
//
// Live mode: on Base Sepolia (chainId 84532), or anywhere with BEACON=quicknet, the beacon is drand quicknet:
// genesis, period and pin are the pinned constants below, the public key is fetched from api.drand.sh and the
// served info must match the pin. Output: ../shared/deployment.base-sepolia.json on chain 84532.
// DEPLOYMENT_FILE overrides the output path (dry run: BEACON=quicknet DEPLOYMENT_FILE=/tmp/x.json --network hardhat).
//   RPC_URL=... DEPLOYER_KEY=... npx hardhat run scripts/deploy.js --network baseSepolia
//   npx hardhat verify --network baseSepolia <address> 1692803367 3 0x<chainHash> 0x<publicKey>   (Sourcify, no key)
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const SHARED_DIR = path.join(__dirname, "..", "..", "shared");

function readGenesisFromBeaconInfo() {
  const file = path.join(SHARED_DIR, "beacon-info.json");
  if (!fs.existsSync(file)) return undefined;
  const info = JSON.parse(fs.readFileSync(file, "utf8"));
  return info.genesis_time;
}

/** Beacon pin from beacon-info.json: { chainHash, publicKey } as lowercase hex without 0x. */
function readBeaconPin() {
  const file = path.join(SHARED_DIR, "beacon-info.json");
  if (!fs.existsSync(file)) throw new Error(`${file} is missing: the beacon pin (hash, public_key) is required to deploy`);
  const info = JSON.parse(fs.readFileSync(file, "utf8"));
  const clean = (v) => String(v ?? "").replace(/^0x/, "").toLowerCase();
  const chainHash = clean(info.hash);
  const publicKey = clean(info.public_key);
  if (!/^[0-9a-f]{64}$/.test(chainHash)) throw new Error(`beacon-info.json: hash must be 32 bytes of hex, got ${info.hash}`);
  if (!/^([0-9a-f]{2})+$/.test(publicKey)) throw new Error(`beacon-info.json: public_key must be hex, got ${info.public_key}`);
  return { chainHash, publicKey };
}

const QUICKNET = {
  chainHash: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
  genesisTime: 1692803367,
  period: 3,
  scheme: "bls-unchained-g1-rfc9380",
};

/** quicknet pin: the public key comes from the relay, everything else must equal the constants above. */
async function quicknetPin() {
  const url = `https://api.drand.sh/${QUICKNET.chainHash}/info`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const info = await res.json();
  if (info.hash !== QUICKNET.chainHash || info.genesis_time !== QUICKNET.genesisTime || info.period !== QUICKNET.period || info.schemeID !== QUICKNET.scheme) {
    throw new Error(`${url} does not serve drand quicknet: ${JSON.stringify(info)}`);
  }
  const publicKey = String(info.public_key).toLowerCase();
  if (!/^[0-9a-f]{192}$/.test(publicKey)) throw new Error(`quicknet public_key must be 96 bytes of hex, got ${info.public_key}`);
  return { chainHash: QUICKNET.chainHash, publicKey };
}

function toUint(name, value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be a non negative integer, got ${value}`);
  return n;
}

async function main() {
  const { chainId } = await hre.ethers.provider.getNetwork();
  const baseSepolia = Number(chainId) === 84532;
  const quicknet = baseSepolia || process.env.BEACON === "quicknet";

  let period, genesisTime, pin;
  if (quicknet) {
    ({ period, genesisTime } = QUICKNET);
    pin = await quicknetPin();
  } else {
    period = toUint("BEACON_PERIOD", process.env.BEACON_PERIOD ?? 3);
    if (period === 0) throw new Error("BEACON_PERIOD must be > 0");
    let genesis = process.env.BEACON_GENESIS ?? readGenesisFromBeaconInfo();
    if (genesis === undefined) genesis = Math.floor(Date.now() / 1000) - 60;
    genesisTime = toUint("BEACON_GENESIS", genesis);
    pin = readBeaconPin();
  }

  const [deployer] = await hre.ethers.getSigners();
  const Factory = await hre.ethers.getContractFactory("SealRegistry");
  const registry = await Factory.deploy(genesisTime, period, "0x" + pin.chainHash, "0x" + pin.publicKey);
  const receipt = await registry.deploymentTransaction().wait();
  const address = await registry.getAddress();

  // The RPC_URL env may embed a provider key: on Base Sepolia record the public endpoint instead.
  const rpcUrl = baseSepolia ? "https://sepolia.base.org" : hre.network.config.url || "http://127.0.0.1:8545";
  const artifact = await hre.artifacts.readArtifact("SealRegistry");

  const deployment = {
    address,
    abi: artifact.abi,
    chainId: Number(chainId),
    deployBlock: receipt.blockNumber,
    rpcUrl,
    genesisTime,
    period,
    beaconChainHash: pin.chainHash,
    beaconPublicKey: pin.publicKey,
    office: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(SHARED_DIR, { recursive: true });
  const out = process.env.DEPLOYMENT_FILE
    ? path.resolve(process.env.DEPLOYMENT_FILE)
    : path.join(SHARED_DIR, baseSepolia ? "deployment.base-sepolia.json" : "deployment.json");
  fs.writeFileSync(out, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`SealRegistry deployed at ${address} (chainId ${deployment.chainId}, block ${receipt.blockNumber}, genesis ${genesisTime}, period ${period}${quicknet ? ", drand quicknet" : ""})`);
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
