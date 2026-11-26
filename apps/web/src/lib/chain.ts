import { createPublicClient, fallback, http, type Transport } from "viem";
import { baseSepolia } from "viem/chains";
import { chain, rpcUrl } from "./config";

// Public Base Sepolia endpoints throttle bursts of reads. Falling back across a few of them keeps
// the demo responsive; set NEXT_PUBLIC_RPC_URL to a dedicated endpoint for anything serious.
const BASE_SEPOLIA_FALLBACKS = ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"];

export function rpcTransport(): Transport {
  const urls = chain.id === baseSepolia.id ? [...new Set([rpcUrl, ...BASE_SEPOLIA_FALLBACKS])] : [rpcUrl];
  const transports = urls.map((u) => http(u, { retryCount: 2, retryDelay: 300, timeout: 15_000 }));
  return transports.length === 1 ? transports[0] : fallback(transports, { retryCount: 1 });
}

export const publicClient = createPublicClient({ chain, transport: rpcTransport(), batch: { multicall: false } });
