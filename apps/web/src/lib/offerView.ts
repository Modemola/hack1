import type { Hex } from "viem";
import { getCompanyStats, getOffer, type CompanyStats, type Offer } from "./pakka";

export const OFFER_ID = /^0x[0-9a-fA-F]{64}$/;

/** Public, shareable view of one recorded offer. Null when the id isn't a recorded offer. */
export async function loadOfferView(id: string): Promise<{ offer: Offer; stats: CompanyStats } | null> {
  if (!OFFER_ID.test(id)) return null;
  const offer = await getOffer(id.toLowerCase() as Hex);
  if (offer.status === "NONE") return null;
  const stats = await getCompanyStats(offer.domain);
  return { offer, stats };
}

export const STATUS_TEXT: Record<Offer["status"], string> = {
  NONE: "Unknown",
  ACTIVE: "On track",
  DELAYED: "Joining delayed",
  REVOKED: "Revoked by the company",
  JOINED_ON_TIME: "Joined on time",
  JOINED_LATE: "Joined late",
};
