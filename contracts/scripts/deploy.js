// Deploys SealRegistry(genesisTime, period, beaconChainHash, beaconPublicKey) and writes ../shared/deployment.json.
// Usage: npx hardhat run scripts/deploy.js --network localhost
// Env: BEACON_GENESIS (unix seconds), BEACON_PERIOD (seconds, default 3).
// The beacon pin (chain hash, public key) is read from ../shared/beacon-info.json (required).
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

function toUint(name, value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be a non negative integer, got ${value}`);
  return n;
}

async function main() {
  const period = toUint("BEACON_PERIOD", process.env.BEACON_PERIOD ?? 3);
  if (period === 0) throw new Error("BEACON_PERIOD must be > 0");

  let genesis = process.env.BEACON_GENESIS ?? readGenesisFromBeaconInfo();
  if (genesis === undefined) genesis = Math.floor(Date.now() / 1000) - 60;
  const genesisTime = toUint("BEACON_GENESIS", genesis);
  const pin = readBeaconPin();

  const [deployer] = await hre.ethers.getSigners();
  const Factory = await hre.ethers.getContractFactory("SealRegistry");
  const registry = await Factory.deploy(genesisTime, period, "0x" + pin.chainHash, "0x" + pin.publicKey);
  await registry.waitForDeployment();
  const address = await registry.getAddress();

  const { chainId } = await hre.ethers.provider.getNetwork();
  const rpcUrl = hre.network.config.url || "http://127.0.0.1:8545";
  const artifact = await hre.artifacts.readArtifact("SealRegistry");

  const deployment = {
    address,
    abi: artifact.abi,
    chainId: Number(chainId),
    rpcUrl,
    genesisTime,
    period,
    beaconChainHash: pin.chainHash,
    beaconPublicKey: pin.publicKey,
    office: deployer.address,
    deployedAt: new Date().toISOString(),
  };

  fs.mkdirSync(SHARED_DIR, { recursive: true });
  const out = path.join(SHARED_DIR, "deployment.json");
  fs.writeFileSync(out, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`SealRegistry deployed at ${address} (chainId ${deployment.chainId}, genesis ${genesisTime}, period ${period})`);
  console.log(`Wrote ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
