// Prints the recorded offer ids for a company domain. Usage: node scripts/offer-ids.mjs nimbus.demo
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.production", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => l.split("=").map((s) => s.trim())),
);
const client = createPublicClient({ chain: baseSepolia, transport: http(env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org") });
const ids = await client.readContract({
  address: env.NEXT_PUBLIC_REGISTRY,
  abi: parseAbi(["function offersOfDomain(string) view returns (bytes32[])"]),
  functionName: "offersOfDomain",
  args: [process.argv[2] ?? "nimbus.demo"],
});
console.log(ids.join("\n"));
