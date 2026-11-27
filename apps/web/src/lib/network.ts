import type { Address, Hex } from "viem";
import { publicClient } from "./chain";
import { addresses, chain } from "./config";
import { GuaranteeState, OfferStatus, joiningGuaranteeAbi, pakkaRegistryAbi, type GuaranteeStateName, type Offer } from "./pakka";

export interface GuaranteeSummary {
  id: number;
  company: Address;
  domain: string;
  state: GuaranteeStateName;
  amount: bigint;
  paid: bigint;
  stipendPerMonth: bigint;
  joinDate: bigint;
  createdAt: bigint;
  role: string;
}

export interface NetworkSnapshot {
  companies: number;
  offers: number;
  delayed: number;
  revoked: number;
  joined: number;
  guarantees: number;
  lockedNow: bigint;
  paidToCandidates: bigint;
  recentOffers: Offer[];
  recentGuarantees: GuaranteeSummary[];
}

const registry = { address: addresses.registry, abi: pakkaRegistryAbi } as const;
const escrow = { address: addresses.escrow, abi: joiningGuaranteeAbi } as const;

// One multicall where the chain has Multicall3 (Base Sepolia), plain parallel reads otherwise
// (a local Hardhat chain). Keeps the snapshot to a handful of RPC requests on public endpoints.
async function readAll<T>(calls: { functionName: string; args: readonly unknown[]; address: Address; abi: unknown }[]): Promise<T[]> {
  if (!calls.length) return [];
  if (chain.contracts?.multicall3) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (await publicClient.multicall({ contracts: calls as any, allowFailure: false })) as T[];
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Promise.all(calls.map((c) => publicClient.readContract(c as any) as Promise<T>));
}

type RawOffer = {
  candidate: Address;
  promisedDate: bigint;
  currentDate: bigint;
  issuedAt: bigint;
  postponements: number;
  status: number;
  escrowed: boolean;
  selfReportedDelay: boolean;
  domain: string;
};

type RawGuarantee = {
  company: Address;
  state: number;
  amount: bigint;
  paid: bigint;
  stipendPerMonth: bigint;
  joinDate: bigint;
  createdAt: bigint;
  role: string;
};

/** Everything on the public record, summed up. Reads contract state only, so it needs no event indexer. */
export async function getNetworkSnapshot(recent = 8): Promise<NetworkSnapshot> {
  const [domains, count] = await Promise.all([
    publicClient.readContract({ ...registry, functionName: "allDomains" }),
    publicClient.readContract({ ...escrow, functionName: "count" }),
  ]);

  const idLists = await readAll<readonly Hex[]>(domains.map((d) => ({ ...registry, functionName: "offersOfDomain", args: [d] })));
  const ids = idLists.flat();
  const [raw, rawG] = await Promise.all([
    readAll<RawOffer>(ids.map((id) => ({ ...registry, functionName: "getOffer", args: [id] }))),
    readAll<RawGuarantee>(Array.from({ length: Number(count) }, (_, i) => ({ ...escrow, functionName: "get", args: [BigInt(i)] }))),
  ]);

  const offers: Offer[] = raw.map((o, i) => ({ ...o, id: ids[i], status: OfferStatus[o.status] }));
  const companies = [...new Set(rawG.map((g) => g.company))];
  const names = await readAll<string>(companies.map((c) => ({ ...registry, functionName: "companyDomain", args: [c] })));
  const domainOf = new Map(companies.map((c, i) => [c, names[i]]));

  const guarantees: GuaranteeSummary[] = rawG.map((g, i) => ({
    id: i,
    company: g.company,
    domain: domainOf.get(g.company) || "",
    state: GuaranteeState[g.state],
    amount: g.amount,
    paid: g.paid,
    stipendPerMonth: g.stipendPerMonth,
    joinDate: g.joinDate,
    createdAt: g.createdAt,
    role: g.role,
  }));

  let lockedNow = 0n;
  let paidToCandidates = 0n;
  for (const g of guarantees) {
    if (g.state === "OFFERED" || g.state === "ACCEPTED") lockedNow += g.amount - g.paid;
    // A withdrawn guarantee marks everything as paid out, but the rest went back to the company.
    if (g.state !== "WITHDRAWN") paidToCandidates += g.state === "OFFERED" ? 0n : g.paid;
  }

  return {
    companies: domains.length,
    offers: offers.length,
    delayed: offers.filter((o) => o.status === "DELAYED").length,
    revoked: offers.filter((o) => o.status === "REVOKED").length,
    joined: offers.filter((o) => o.status === "JOINED_ON_TIME" || o.status === "JOINED_LATE").length,
    guarantees: guarantees.length,
    lockedNow,
    paidToCandidates,
    recentOffers: [...offers].sort((a, b) => Number(b.issuedAt - a.issuedAt)).slice(0, recent),
    recentGuarantees: [...guarantees].reverse().slice(0, recent),
  };
}
