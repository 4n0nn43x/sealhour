require("@nomicfoundation/hardhat-toolbox");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
const path = require("path");

// Load a local .env if dotenv happens to be installed (optional, never required).
try {
  require("dotenv").config();
} catch (_) {
  /* dotenv not installed: rely on the process environment */
}

const SOLC_VERSION = "0.8.26";

// The solc binary CDN is unreachable in the sandbox: use solc-js from npm instead.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    return {
      compilerPath: path.join(__dirname, "node_modules/solc/soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: require("solc").version(),
    };
  }
  return runSuper();
});

const networks = {
  localhost: { url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545" },
};

// Base Sepolia only when both variables come from the environment. Never hardcode keys.
if (process.env.RPC_URL && process.env.DEPLOYER_KEY) {
  networks.baseSepolia = {
    url: process.env.RPC_URL,
    accounts: [process.env.DEPLOYER_KEY],
    chainId: 84532,
  };
}

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks,
  // `npx hardhat verify --network baseSepolia ...` submits to Sourcify (no key, Blockscout reads it);
  // Etherscan (API V2) only when ETHERSCAN_API_KEY is set.
  etherscan: { apiKey: process.env.ETHERSCAN_API_KEY || "", enabled: Boolean(process.env.ETHERSCAN_API_KEY) },
  sourcify: { enabled: true },
};
