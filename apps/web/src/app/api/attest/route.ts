import { NextResponse } from "next/server";
import { getAddress, isAddress, isHex, type Hex } from "viem";
import { analyzeEmail, AttestationKind, signAttestation, type Attestation } from "@pakka/verifier";
import { pakkaRegistryAbi } from "@pakka/contracts/abi";
import { addresses, chain } from "@/lib/config";
import { publicClient } from "@/lib/chain";
import { aiOptions, clientIp, MAX_EMAIL_BYTES, rateLimited, verifierKey } from "@/lib/server";

export const runtime = "nodejs";

const ZERO32 = `0x${"00".repeat(32)}` as Hex;

/**
 * Re-verifies an email and, if it checks out, signs an attestation the given wallet can submit
 * to PakkaRegistry. Body: { eml, subject, offerId? }.
 */
export async function POST(req: Request) {
  if (rateLimited(`attest:${clientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429 });
  }
  let body: { eml?: string; subject?: string; offerId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { eml, subject, offerId } = body;
  if (!eml || eml.length > MAX_EMAIL_BYTES) return NextResponse.json({ error: "Missing email." }, { status: 400 });
  if (!subject || !isAddress(subject)) return NextResponse.json({ error: "Connect a wallet first." }, { status: 400 });

  // Only ask the AI when the rules couldn't find a joining date it would need.
  let report = await analyzeEmail(eml, { ai: false });
  if (!report.offer.joinDate && (report.email.kind === "OFFER" || report.email.kind === "POSTPONED" || report.email.kind === "UNKNOWN")) {
    report = await analyzeEmail(eml, { ai: aiOptions() });
  }
  if (!report.attestable || !report.emailId || !report.dkim.domain) {
    return NextResponse.json({ error: report.verdict === "verified" ? "This email isn't an offer or offer update, so there's nothing to record." : report.headline }, { status: 400 });
  }

  const domain = report.dkim.domain;
  const joinUnix = report.offer.joinDate ? BigInt(Date.parse(`${report.offer.joinDate.value}T00:00:00Z`) / 1000) : 0n;
  const kindName = report.email.kind;
  let kind: number;
  let linkedOffer: Hex = ZERO32;

  if (kindName === "COMPANY_VERIFY") {
    if (!report.walletToVerify || getAddress(report.walletToVerify) !== getAddress(subject)) {
      return NextResponse.json(
        { error: `This verification email is for wallet ${report.walletToVerify ?? "(none)"}, not the one you're connected with.` },
        { status: 400 },
      );
    }
    kind = AttestationKind.COMPANY;
  } else if (kindName === "OFFER") {
    kind = AttestationKind.OFFER;
    linkedOffer = report.emailId;
  } else {
    kind = AttestationKind[kindName as "POSTPONED" | "REVOKED" | "JOINED"];
    if (!offerId || !isHex(offerId) || offerId.length !== 66) {
      return NextResponse.json({ error: "Choose which of your offers this update belongs to." }, { status: 400 });
    }
    const offer = await publicClient.readContract({
      address: addresses.registry,
      abi: pakkaRegistryAbi,
      functionName: "getOffer",
      args: [offerId as Hex],
    });
    if (offer.candidate === "0x0000000000000000000000000000000000000000") {
      return NextResponse.json({ error: "That offer isn't recorded yet. Record the offer email first." }, { status: 400 });
    }
    if (getAddress(offer.candidate) !== getAddress(subject)) {
      return NextResponse.json({ error: "That offer belongs to a different wallet." }, { status: 400 });
    }
    if (offer.domain !== domain) {
      return NextResponse.json({ error: `This update is from ${domain}, but that offer is from ${offer.domain}.` }, { status: 400 });
    }
    linkedOffer = offerId as Hex;
  }

  const attestation: Attestation = {
    kind,
    subject: getAddress(subject),
    emailId: report.emailId,
    offerId: linkedOffer,
    domain,
    date: kindName === "OFFER" || kindName === "POSTPONED" ? joinUnix : 0n,
    emailTime: BigInt(report.emailTime),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  };
  const signature = await signAttestation(verifierKey(), chain.id, addresses.registry, attestation);

  return NextResponse.json({
    attestation: {
      ...attestation,
      date: attestation.date.toString(),
      emailTime: attestation.emailTime.toString(),
      deadline: attestation.deadline.toString(),
    },
    signature,
    report,
  });
}
