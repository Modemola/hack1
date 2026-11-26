import type { GuaranteeStateName, OfferStatusName } from "@/lib/pakka";

const OFFER: Record<OfferStatusName, [string, string]> = {
  NONE: ["Unknown", "bg-sunk text-muted"],
  ACTIVE: ["On track", "bg-sunk text-ink"],
  DELAYED: ["Delayed", "bg-warn-soft text-warn"],
  REVOKED: ["Revoked", "bg-danger-soft text-danger"],
  JOINED_ON_TIME: ["Joined on time", "bg-verified-soft text-verified"],
  JOINED_LATE: ["Joined late", "bg-warn-soft text-warn"],
};

const GUARANTEE: Record<GuaranteeStateName, [string, string]> = {
  NONE: ["Unknown", "bg-sunk text-muted"],
  OFFERED: ["Awaiting acceptance", "bg-accent-soft text-accent"],
  ACCEPTED: ["Accepted", "bg-sunk text-ink"],
  JOINED: ["Joined", "bg-verified-soft text-verified"],
  REVOKED: ["Revoked", "bg-danger-soft text-danger"],
  CANCELLED: ["Cancelled", "bg-sunk text-muted"],
  WITHDRAWN: ["Candidate withdrew", "bg-sunk text-muted"],
};

export function StatusPill({ status, guarantee }: { status: OfferStatusName | GuaranteeStateName; guarantee?: boolean }) {
  const [label, cls] = guarantee ? GUARANTEE[status as GuaranteeStateName] : OFFER[status as OfferStatusName];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
