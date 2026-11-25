// Manual check: runs the full analysis on a fixture with the live AI read enabled.
// Run with NODE_USE_ENV_PROXY=1 behind a proxy.
import { readFileSync } from "node:fs";
import { analyzeEmail, demoResolver } from "../src/index.js";
const name = process.argv[2] ?? "scam-lookalike";
const raw = readFileSync(new URL(`../fixtures/${name}.eml`, import.meta.url), "utf8");
const t = Date.now();
const r = await analyzeEmail(raw, { resolver: demoResolver, ai: { apiKey: process.env.NEARAI_API_KEY } });
console.log(JSON.stringify(r, null, 2));
console.error(`${Date.now() - t}ms`);
