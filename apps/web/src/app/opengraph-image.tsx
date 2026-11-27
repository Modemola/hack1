import { ImageResponse } from "next/og";
import { OG, OG_SIZE, OgLogo, OgStamp } from "@/lib/og";

export const alt = "Pakka: is your job offer real?";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: OG.paper, padding: 72, fontFamily: "sans-serif", color: OG.ink }}>
        <OgLogo />
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "center", gap: 8 }}>
          <div style={{ display: "flex", fontSize: 96, lineHeight: 1 }}>Is your offer</div>
          <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 18, marginLeft: 12 }}>
            <OgStamp size={60} />
            <div style={{ display: "flex", fontSize: 96, lineHeight: 1 }}>?</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 28, color: OG.muted }}>
          <div style={{ display: "flex" }}>Verify offer letters. See who keeps joining dates. Get paid while you wait.</div>
        </div>
      </div>
    ),
    size,
  );
}
