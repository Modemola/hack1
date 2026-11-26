// Writes .env.local (or the file given as the 2nd argument) for a contracts deployment.
// Usage: node scripts/use-deployment.mjs localhost|baseSepolia [envFile]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const name = process.argv[2] ?? "localhost";
const target = path.join(here, "..", process.argv[3] ?? ".env.local");
const d = JSON.parse(readFileSync(path.join(here, "../../../packages/contracts/deployments", `${name}.json`), "utf8"));

const lines = [
  `# Generated from packages/contracts/deployments/${name}.json`,
  `NEXT_PUBLIC_CHAIN_ID=${d.chainId}`,
  `NEXT_PUBLIC_REGISTRY=${d.contracts.PakkaRegistry}`,
  `NEXT_PUBLIC_ESCROW=${d.contracts.JoiningGuarantee}`,
  `NEXT_PUBLIC_USD=${d.contracts.TestUSD}`,
  `NEXT_PUBLIC_DEMO_MODE=${d.demoMode}`,
];
writeFileSync(target, lines.join("\n") + "\n");
console.log(`Wrote ${path.relative(process.cwd(), target)} for ${name} (chain ${d.chainId})`);
