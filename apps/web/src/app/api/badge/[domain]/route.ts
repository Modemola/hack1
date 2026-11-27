import { getCompanyStats } from "@/lib/pakka";
import { scoreTone } from "@/lib/format";

export const revalidate = 300;

const DOMAIN = /^[a-z0-9.-]{1,253}$/;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Rough text width for 11px Verdana, the classic badge font.
function textWidth(s: string) {
  return Math.round(s.length * 6.8 + 10);
}

/** An embeddable SVG badge with a company's Promise Score, for careers pages. */
export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const domain = decodeURIComponent((await params).domain).toLowerCase();
  if (!DOMAIN.test(domain)) return new Response("Bad domain", { status: 400 });

  let value = "unavailable";
  let color = "#6b7280";
  try {
    const s = await getCompanyStats(domain);
    const tone = scoreTone(s.score, s.judged);
    value = s.judged ? `${s.score}/100` : s.offers ? "new" : "no record";
    color = tone === "good" ? "#1e7f4f" : tone === "ok" ? "#b7791f" : tone === "bad" ? "#c92a2a" : "#6b7280";
  } catch {
    // Chain unreachable: still return a valid badge.
  }

  const label = "Pakka Promise Score";
  const lw = textWidth(label);
  const vw = textWidth(value);
  const w = lw + vw;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)} for ${esc(domain)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${w}" height="20" rx="4"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#15203b"/><rect x="${lw}" width="${vw}" height="20" fill="${color}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14" font-weight="bold">${esc(value)}</text></g></svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
      "access-control-allow-origin": "*",
    },
  });
}
