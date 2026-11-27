// Shared pieces for link-preview images (rendered by next/og, so inline styles only).
export const OG_SIZE = { width: 1200, height: 630 };
export const OG = { paper: "#faf7f0", ink: "#15203b", muted: "#4a5470", accent: "#d9480f", good: "#1e7f4f", ok: "#b7791f", bad: "#c92a2a", line: "#e6e0d4" };

export function OgLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: OG.accent, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>P</div>
      Pakka
    </div>
  );
}

export function OgStamp({ text = "PAKKA", color = OG.good, size = 72 }: { text?: string; color?: string; size?: number }) {
  return (
    <div style={{ display: "flex", border: `4px solid ${color}`, borderRadius: 22, padding: 6, transform: "rotate(-8deg)" }}>
      <div style={{ display: "flex", border: `4px solid ${color}`, color, borderRadius: 14, padding: "8px 32px", fontSize: size, fontWeight: 800, letterSpacing: 10 }}>
        {text}
      </div>
    </div>
  );
}
