import { NextResponse } from "next/server";
import { analyzeEmail } from "@pakka/verifier";
import { aiOptions, clientIp, rateLimited, readEmailBody } from "@/lib/server";

export const runtime = "nodejs";

/** POST the raw .eml as the request body. Returns the analysis report. Nothing is stored. */
export async function POST(req: Request) {
  if (rateLimited(`verify:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many checks. Wait a minute and try again." }, { status: 429 });
  }
  try {
    const raw = await readEmailBody(req);
    const report = await analyzeEmail(raw, { ai: aiOptions() });
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not read that email." }, { status: 400 });
  }
}
