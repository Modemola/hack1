import { ImageResponse } from "next/og";
import { getCompanyStats } from "@/lib/pakka";
import { scoreTone, plural } from "@/lib/format";
import { OG, OG_SIZE, OgLogo } from "@/lib/og";

export const alt = "A company's Pakka Promise Score";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 60;

const TONE = { good: OG.good, ok: OG.ok, bad: OG.bad, none: OG.muted } as const;

export default async function Image({ params }: { params: Promise<{ domain: string }> }) {
  const domain = decodeURIComponent((await params).domain).slice(0, 60);
  const stats = await getCompanyStats(domain).catch(() => null);
  const judged = stats?.judged ?? 0;
  const color = TONE[scoreTone(stats?.score ?? 0, judged)];
  const summary = !stats
    ? "Promise Scores are built from verified offer emails."
    : judged
      ? `${stats.joinedOnTime} joined on time · ${stats.delayed + stats.joinedLate} delayed · ${stats.revoked} revoked`
      : stats.offers
        ? `${plural(stats.offers, "offer")} on record, none due yet`
        : "No offers on record yet";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: OG.paper, padding: 72, fontFamily: "sans-serif", color: OG.ink }}>
        <OgLogo />
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 48 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 700 }}>
            <div style={{ display: "flex", fontSize: 30, color: OG.accent, fontWeight: 700, letterSpacing: 3 }}>PROMISE SCORE</div>
            <div style={{ display: "flex", fontSize: domain.length > 18 ? 64 : 84, fontWeight: 800, marginTop: 12, lineHeight: 1.05 }}>{domain}</div>
            <div style={{ fontSize: 30, color: OG.muted, marginTop: 24, display: "flex" }}>{summary}</div>
          </div>
          <div
            style={{
              width: 260,
              height: 260,
              borderRadius: 130,
              border: `18px solid ${color}`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color,
            }}
          >
            <div style={{ display: "flex", fontSize: judged ? 96 : 56, fontWeight: 800, lineHeight: 1 }}>{judged ? stats!.score : "New"}</div>
            {judged ? <div style={{ display: "flex", fontSize: 28, color: OG.muted }}>out of 100</div> : null}
          </div>
        </div>
        <div style={{ fontSize: 26, color: OG.muted, display: "flex" }}>Built from verified offer emails and escrowed offers, recorded onchain</div>
      </div>
    ),
    size,
  );
}
