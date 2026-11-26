// Standalone deploy with viem (uses Node's fetch, so it works behind HTTPS proxies where
// Hardhat's network client doesn't). Run `hardhat compile` first.
//
//   DEPLOYER_PRIVATE_KEY=0x... VERIFIER_ADDRESS=0x... [DEMO_MODE=false] [RPC_URL=...] \
//     NODE_USE_ENV_PROXY=1 npx ts-node scripts/deploy-viem.ts baseSepolia
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const network = process.argv[2] ?? "baseSepolia";
if (network !== "baseSepolia") throw new Error("Only baseSepolia is configured here.");
const chain = baseSepolia;
const rpc = process.env.RPC_URL ?? "https://sepolia.base.org";

const key = process.env.DEPLOYER_PRIVATE_KEY as Hex | undefined;
if (!key) throw new Error("Set DEPLOYER_PRIVATE_KEY");
const account = privateKeyToAccount(key);
const verifier = (process.env.VERIFIER_ADDRESS as Address | undefined) ??
  (process.env.VERIFIER_PRIVATE_KEY ? privateKeyToAccount(process.env.VERIFIER_PRIVATE_KEY as Hex).address : undefined);
if (!verifier) throw new Error("Set VERIFIER_ADDRESS or VERIFIER_PRIVATE_KEY");
const demoMode = process.env.DEMO_MODE !== "false";

const pub = createPublicClient({ chain, transport: http(rpc) });
const wallet = createWalletClient({ account, chain, transport: http(rpc) });

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const file = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const a = JSON.parse(readFileSync(file, "utf8"));
  return { abi: a.abi, bytecode: a.bytecode };
}

async function deploy(name: string, args: unknown[]): Promise<Address> {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode, args });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deployment failed`);
  console.log(`${name.padEnd(18)} ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function main() {
  console.log(`Deploying to ${network} (chain ${chain.id}) from ${account.address}; verifier ${verifier}; demoMode ${demoMode}`);
  const startBlock = await pub.getBlockNumber();
  const usd = await deploy("TestUSD", []);
  const registry = await deploy("PakkaRegistry", [verifier]);
  const escrow = await deploy("JoiningGuarantee", [registry, demoMode]);
  const hash = await wallet.writeContract({ address: registry, abi: artifact("PakkaRegistry").abi, functionName: "setReporter", args: [escrow, true] });
  await pub.waitForTransactionReceipt({ hash });
  console.log("Escrow set as registry reporter");

  const out = {
    network,
    chainId: chain.id,
    startBlock: Number(startBlock),
    verifier,
    demoMode,
    contracts: { TestUSD: usd, PakkaRegistry: registry, JoiningGuarantee: escrow },
    deployedAt: new Date().toISOString(),
  };
  const file = path.join(__dirname, "..", "deployments", `${network}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote deployments/${network}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
