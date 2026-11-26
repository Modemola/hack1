import { baseSepolia, hardhat } from "viem/chains";
import type { Address, Chain } from "viem";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);

export const chain: Chain = chainId === baseSepolia.id ? baseSepolia : hardhat;

export const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ?? (chain.id === hardhat.id ? "http://127.0.0.1:8545" : chain.rpcUrls.default.http[0]);

const zero = "0x0000000000000000000000000000000000000000" as Address;

export const addresses = {
  registry: (process.env.NEXT_PUBLIC_REGISTRY ?? zero) as Address,
  escrow: (process.env.NEXT_PUBLIC_ESCROW ?? zero) as Address,
  usd: (process.env.NEXT_PUBLIC_USD ?? zero) as Address,
};

export const isConfigured = addresses.registry !== zero;

export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

export const explorer = chain.blockExplorers?.default.url;

export function txUrl(hash: string) {
  return explorer ? `${explorer}/tx/${hash}` : undefined;
}

export function addressUrl(address: string) {
  return explorer ? `${explorer}/address/${address}` : undefined;
}

export const USD_DECIMALS = 6;
