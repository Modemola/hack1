import "server-only";
import { createWalletClient, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import type { AiOptions } from "@pakka/verifier";
import { chain } from "./config";
import { rpcTransport } from "./chain";

// Well-known Hardhat dev keys (accounts #0 and #1). Only ever used against a local chain.
const HARDHAT_KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const HARDHAT_KEY_1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const isLocal = chain.id === hardhat.id;

function key(name: string, localDefault: Hex): Hex | null {
  const v = process.env[name];
  if (v && /^0x[0-9a-fA-F]{64}$/.test(v)) return v as Hex;
  return isLocal ? localDefault : null;
}

export function verifierKey(): Hex {
  const k = key("VERIFIER_PRIVATE_KEY", HARDHAT_KEY_1);
  if (!k) throw new Error("VERIFIER_PRIVATE_KEY is not set");
  return k;
}

export function faucetWallet() {
  const k = key("FAUCET_PRIVATE_KEY", HARDHAT_KEY_0);
  if (!k) return null;
  return createWalletClient({ account: privateKeyToAccount(k), chain, transport: rpcTransport() });
}

export function aiOptions(): AiOptions | false {
  if (process.env.PAKKA_AI === "off") return false;
  return {
    apiKey: process.env.NEARAI_API_KEY,
    model: process.env.PAKKA_AI_MODEL ?? "anthropic/claude-haiku-5-5",
    timeoutMs: 12000,
  };
}

export { isLocal };

/** Tiny in-memory rate limiter. Good enough for a demo deployment on one instance. */
const hits = new Map<string, number[]>();
export function rateLimited(bucket: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(bucket) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) {
    hits.set(bucket, list);
    return true;
  }
  list.push(now);
  hits.set(bucket, list);
  return false;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

export const MAX_EMAIL_BYTES = 2 * 1024 * 1024;

export async function readEmailBody(req: Request): Promise<string> {
  const text = await req.text();
  if (text.length > MAX_EMAIL_BYTES) throw new Error("That file is too large to be an email (2 MB max).");
  if (!text.trim()) throw new Error("The file is empty.");
  return text;
}
