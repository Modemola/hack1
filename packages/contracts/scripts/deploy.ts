import hre from "hardhat";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Deploys TestUSD, PakkaRegistry and JoiningGuarantee, wires them together and writes
 * deployments/<network>.json for the web app.
 *
 * Env:
 *  VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY  signer the registry trusts (defaults to hardhat account #1 locally)
 *  DEMO_MODE=false                           disable per-offer time travel (default: enabled)
 */
async function main() {
  const [deployer, localVerifier] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const verifier =
    (process.env.VERIFIER_ADDRESS as `0x${string}` | undefined) ??
    (process.env.VERIFIER_PRIVATE_KEY ? privateKeyToAccount(process.env.VERIFIER_PRIVATE_KEY as `0x${string}`).address : undefined) ??
    (hre.network.name === "hardhat" || hre.network.name === "localhost" ? localVerifier.account.address : undefined);
  if (!verifier) throw new Error("Set VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY for this network.");
  const demoMode = process.env.DEMO_MODE !== "false";

  console.log(`Deploying to ${hre.network.name} (chain ${chainId}) from ${deployer.account.address}`);
  const startBlock = await publicClient.getBlockNumber();
  const usd = await hre.viem.deployContract("TestUSD", []);
  console.log("TestUSD           ", usd.address);
  const registry = await hre.viem.deployContract("PakkaRegistry", [verifier]);
  console.log("PakkaRegistry     ", registry.address);
  const escrow = await hre.viem.deployContract("JoiningGuarantee", [registry.address, demoMode]);
  console.log("JoiningGuarantee  ", escrow.address);
  const tx = await registry.write.setReporter([escrow.address, true]);
  await publicClient.waitForTransactionReceipt({ hash: tx });

  const out = {
    network: hre.network.name,
    chainId,
    startBlock: Number(startBlock),
    verifier,
    demoMode,
    contracts: { TestUSD: usd.address, PakkaRegistry: registry.address, JoiningGuarantee: escrow.address },
    deployedAt: new Date().toISOString(),
  };
  const file = path.join(__dirname, "..", "deployments", `${hre.network.name === "hardhat" ? "localhost" : hre.network.name}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
