import type { HardhatUserConfig } from "hardhat/config";
import { subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-viem";
import path from "node:path";

const SOLC_VERSION = "0.8.28";

// Use the solc-js compiler bundled in node_modules instead of downloading one,
// so compiling works offline and in locked-down CI.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    const solc = require("solc");
    return {
      compilerPath: path.join(path.dirname(require.resolve("solc/package.json")), "soljson.js"),
      isSolcJs: true,
      version: args.solcVersion,
      longVersion: solc.version(),
    };
  }
  return runSuper();
});

const deployer = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: { version: SOLC_VERSION, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org",
      chainId: 84532,
      accounts: deployer ? [deployer] : [],
    },
  },
};

export default config;
