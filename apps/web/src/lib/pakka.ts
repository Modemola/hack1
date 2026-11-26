import { pakkaRegistryAbi, joiningGuaranteeAbi, testUSDAbi } from "@pakka/contracts/abi";
import { maxUint256, type Account, type Address, type Hex, type WalletClient } from "viem";
import { addresses, chain } from "./config";
import { publicClient } from "./chain";

export { pakkaRegistryAbi, joiningGuaranteeAbi, testUSDAbi };

export const OfferStatus = ["NONE", "ACTIVE", "DELAYED", "REVOKED", "JOINED_ON_TIME", "JOINED_LATE"] as const;
export type OfferStatusName = (typeof OfferStatus)[number];

export const GuaranteeState = ["NONE", "OFFERED", "ACCEPTED", "JOINED", "REVOKED", "CANCELLED", "WITHDRAWN"] as const;
export type GuaranteeStateName = (typeof GuaranteeState)[number];

export interface Offer {
  id: Hex;
  candidate: Address;
  promisedDate: bigint;
  currentDate: bigint;
  issuedAt: bigint;
  postponements: number;
  status: OfferStatusName;
  escrowed: boolean;
  selfReportedDelay: boolean;
  domain: string;
}

export interface CompanyStats {
  domain: string;
  offers: number;
  delayed: number;
  revoked: number;
  joinedOnTime: number;
  joinedLate: number;
  totalDelayDays: number;
  score: number;
  judged: number;
}

export interface Guarantee {
  id: bigint;
  company: Address;
  candidate: Address;
  token: Address;
  state: GuaranteeStateName;
  amount: bigint;
  stipendPerMonth: bigint;
  pledge: bigint;
  paid: bigint;
  joinDate: bigint;
  currentJoinDate: bigint;
  grace: bigint;
  createdAt: bigint;
  stoppedAt: bigint;
  joinClaimedAt: bigint;
  timeOffset: bigint;
  disputed: boolean;
  role: string;
  // derived
  now: bigint;
  earned: bigint;
  claimable: bigint;
  stipendStart: bigint;
  offerId: Hex;
  companyDomain: string;
}

const registry = { address: addresses.registry, abi: pakkaRegistryAbi } as const;
const escrow = { address: addresses.escrow, abi: joiningGuaranteeAbi } as const;
const usdToken = { address: addresses.usd, abi: testUSDAbi } as const;

export async function getOffer(id: Hex): Promise<Offer> {
  const o = await publicClient.readContract({ ...registry, functionName: "getOffer", args: [id] });
  return {
    id,
    candidate: o.candidate,
    promisedDate: o.promisedDate,
    currentDate: o.currentDate,
    issuedAt: o.issuedAt,
    postponements: o.postponements,
    status: OfferStatus[o.status],
    escrowed: o.escrowed,
    selfReportedDelay: o.selfReportedDelay,
    domain: o.domain,
  };
}

export async function getCompanyStats(domain: string): Promise<CompanyStats> {
  const [s, [score, judged]] = await Promise.all([
    publicClient.readContract({ ...registry, functionName: "statsOf", args: [domain] }),
    publicClient.readContract({ ...registry, functionName: "promiseScore", args: [domain] }),
  ]);
  return {
    domain,
    offers: s.offers,
    delayed: s.delayed,
    revoked: s.revoked,
    joinedOnTime: s.joinedOnTime,
    joinedLate: s.joinedLate,
    totalDelayDays: Number(s.totalDelayDays),
    score: Number(score),
    judged: Number(judged),
  };
}

export async function getLeaderboard(): Promise<CompanyStats[]> {
  const domains = await publicClient.readContract({ ...registry, functionName: "allDomains" });
  const stats = await Promise.all(domains.map(getCompanyStats));
  // Judged companies first (best score first), then the rest by offer count.
  return stats.sort((a, b) => (b.judged ? 1 : 0) - (a.judged ? 1 : 0) || b.score - a.score || b.offers - a.offers);
}

export async function getDomainOffers(domain: string): Promise<Offer[]> {
  const ids = await publicClient.readContract({ ...registry, functionName: "offersOfDomain", args: [domain] });
  return (await Promise.all(ids.map(getOffer))).reverse();
}

export async function getCandidateOffers(candidate: Address): Promise<Offer[]> {
  const ids = await publicClient.readContract({ ...registry, functionName: "offersOf", args: [candidate] });
  return (await Promise.all(ids.map(getOffer))).reverse();
}

export async function getCompanyDomain(wallet: Address): Promise<string> {
  return publicClient.readContract({ ...registry, functionName: "companyDomain", args: [wallet] });
}

export async function getGuarantee(id: bigint): Promise<Guarantee> {
  const [g, now, earned, claimable, stipendStart, offerId] = await Promise.all([
    publicClient.readContract({ ...escrow, functionName: "get", args: [id] }),
    publicClient.readContract({ ...escrow, functionName: "nowOf", args: [id] }),
    publicClient.readContract({ ...escrow, functionName: "earned", args: [id] }),
    publicClient.readContract({ ...escrow, functionName: "claimable", args: [id] }),
    publicClient.readContract({ ...escrow, functionName: "stipendStart", args: [id] }),
    publicClient.readContract({ ...escrow, functionName: "offerId", args: [id] }),
  ]);
  const companyDomain = await getCompanyDomain(g.company);
  return {
    id,
    company: g.company,
    candidate: g.candidate,
    token: g.token,
    state: GuaranteeState[g.state],
    amount: g.amount,
    stipendPerMonth: g.stipendPerMonth,
    pledge: g.pledge,
    paid: g.paid,
    joinDate: g.joinDate,
    currentJoinDate: g.currentJoinDate,
    grace: g.grace,
    createdAt: g.createdAt,
    stoppedAt: g.stoppedAt,
    joinClaimedAt: g.joinClaimedAt,
    timeOffset: g.timeOffset,
    disputed: g.disputed,
    role: g.role,
    now: BigInt(now),
    earned,
    claimable,
    stipendStart: BigInt(stipendStart),
    offerId,
    companyDomain,
  };
}

export async function getGuaranteeIds(who: Address, role: "company" | "candidate"): Promise<bigint[]> {
  const ids = await publicClient.readContract({
    ...escrow,
    functionName: role === "company" ? "idsOfCompany" : "idsOfCandidate",
    args: [who],
  });
  return [...ids].reverse();
}

export async function usdBalance(who: Address): Promise<bigint> {
  return publicClient.readContract({ ...usdToken, functionName: "balanceOf", args: [who] });
}

// ------------------------------------------------------------------ writes

type Send = (write: (client: WalletClient, account: Account | Address) => Promise<Hex>) => Promise<Hex>;

export interface SignedAttestation {
  attestation: {
    kind: number;
    subject: Address;
    emailId: Hex;
    offerId: Hex;
    domain: string;
    date: string;
    emailTime: string;
    deadline: string;
  };
  signature: Hex;
}

export function submitAttestation(send: Send, signed: SignedAttestation) {
  const a = signed.attestation;
  return send((client, account) =>
    client.writeContract({
      ...registry,
      chain,
      account,
      functionName: "submit",
      args: [
        { ...a, date: BigInt(a.date), emailTime: BigInt(a.emailTime), deadline: BigInt(a.deadline) },
        signed.signature,
      ],
    }),
  );
}

export function reportSilentDelay(send: Send, offerId: Hex) {
  return send((client, account) =>
    client.writeContract({ ...registry, chain, account, functionName: "reportSilentDelay", args: [offerId] }),
  );
}

/** Tops up test dollars from the faucet and approves the escrow, if needed, before spending. */
export async function prepareSpend(send: Send, account: Address, amount: bigint) {
  if ((await usdBalance(account)) < amount) {
    await send((client, acc) => client.writeContract({ ...usdToken, chain, account: acc, functionName: "faucet" }));
  }
  const allowance = await publicClient.readContract({ ...usdToken, functionName: "allowance", args: [account, addresses.escrow] });
  if (allowance < amount) {
    await send((client, acc) =>
      client.writeContract({ ...usdToken, chain, account: acc, functionName: "approve", args: [addresses.escrow, maxUint256] }),
    );
  }
}

export function faucet(send: Send) {
  return send((client, account) => client.writeContract({ ...usdToken, chain, account, functionName: "faucet" }));
}

export interface NewGuarantee {
  candidate: Address;
  amount: bigint;
  stipendPerMonth: bigint;
  joinDate: bigint;
  grace: bigint;
  pledge: bigint;
  role: string;
}

export async function createGuarantee(send: Send, account: Address, g: NewGuarantee): Promise<bigint> {
  await prepareSpend(send, account, g.amount);
  const id = await publicClient.readContract({ ...escrow, functionName: "count" });
  await send((client, acc) =>
    client.writeContract({
      ...escrow,
      chain,
      account: acc,
      functionName: "create",
      args: [g.candidate, addresses.usd, g.amount, g.stipendPerMonth, g.joinDate, g.grace, g.pledge, g.role],
    }),
  );
  // The new guarantee is the last one this company created.
  const mine = await publicClient.readContract({ ...escrow, functionName: "idsOfCompany", args: [account] });
  return mine.length ? mine[mine.length - 1] : id;
}

type EscrowAction =
  | "accept"
  | "cancel"
  | "revoke"
  | "claimStipend"
  | "confirmJoined"
  | "claimJoined"
  | "finalizeJoined"
  | "disputeJoined"
  | "withdraw";

export function escrowAction(send: Send, action: EscrowAction, id: bigint) {
  return send((client, account) => client.writeContract({ ...escrow, chain, account, functionName: action, args: [id] }));
}

export async function acceptGuarantee(send: Send, account: Address, g: Guarantee) {
  if (g.pledge > 0n) await prepareSpend(send, account, g.pledge);
  return escrowAction(send, "accept", g.id);
}

export function postponeGuarantee(send: Send, id: bigint, newDate: bigint) {
  return send((client, account) =>
    client.writeContract({ ...escrow, chain, account, functionName: "postpone", args: [id, newDate] }),
  );
}

export function warp(send: Send, id: bigint, seconds: bigint) {
  return send((client, account) =>
    client.writeContract({ ...escrow, chain, account, functionName: "demoWarp", args: [id, seconds] }),
  );
}
