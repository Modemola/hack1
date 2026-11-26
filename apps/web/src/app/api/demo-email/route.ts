import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { DEMO_COMPANIES, makeDemoEmail, type DemoCompanyKey, type DemoEmailKind } from "@pakka/verifier";
import { clientIp, rateLimited } from "@/lib/server";

export const runtime = "nodejs";

const KINDS: DemoEmailKind[] = ["OFFER", "POSTPONED", "REVOKED", "JOINED", "SCAM", "COMPANY_VERIFY"];

function parseDay(v: string | null): Date | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Generates a DKIM-signed sample email from a fictional *.demo company, so anyone can try Pakka
 * end to end without a real offer letter. Variants: tamper=1 edits it after signing, unsigned=1
 * strips the signature.
 */
export async function GET(req: Request) {
  if (rateLimited(`demo:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: "Slow down a little." }, { status: 429 });
  }
  const url = new URL(req.url);
  const company = (url.searchParams.get("company") ?? "nimbus") as DemoCompanyKey;
  const kind = (url.searchParams.get("kind") ?? "OFFER").toUpperCase() as DemoEmailKind;
  if (!(company in DEMO_COMPANIES) || !KINDS.includes(kind)) {
    return NextResponse.json({ error: "Unknown demo company or email kind." }, { status: 400 });
  }
  const wallet = url.searchParams.get("wallet") ?? undefined;
  if (kind === "COMPANY_VERIFY" && (!wallet || !isAddress(wallet))) {
    return NextResponse.json({ error: "A wallet address is required." }, { status: 400 });
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const joinDate = parseDay(url.searchParams.get("joinDate")) ?? new Date(today.getTime() + 45 * 86400_000);
  const newJoinDate = parseDay(url.searchParams.get("newDate")) ?? new Date(joinDate.getTime() + 120 * 86400_000);
  const name = url.searchParams.get("name")?.slice(0, 60) || undefined;

  let eml = await makeDemoEmail({
    company: kind === "SCAM" ? "scam" : company,
    kind,
    candidateName: name,
    joinDate,
    newJoinDate,
    wallet,
  });
  if (url.searchParams.get("tamper") === "1") eml = eml.replace("6,50,000", "16,50,000");
  if (url.searchParams.get("unsigned") === "1") eml = eml.replace(/^DKIM-Signature:[\s\S]*?\r\n(?=\S)/, "");

  const filename = `${kind === "SCAM" ? "scam" : company}-${kind.toLowerCase()}${url.searchParams.get("tamper") === "1" ? "-tampered" : ""}.eml`;
  return new NextResponse(eml, {
    headers: {
      "content-type": "message/rfc822; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
