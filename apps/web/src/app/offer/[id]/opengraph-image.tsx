import { ImageResponse } from "next/og";
import { loadOfferView, STATUS_TEXT } from "@/lib/offerView";
import { date } from "@/lib/format";

export const alt = "A Pakka-verified job offer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 60;

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadOfferView(id).catch(() => null);
  const domain = view?.offer.domain ?? "Pakka";
  const joining = view ? date(view.offer.currentDate || view.offer.promisedDate) : "";
  const status = view ? STATUS_TEXT[view.offer.status] : "";
  const bad = view?.offer.status === "REVOKED";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#faf7f0", padding: 72, fontFamily: "sans-serif", color: "#15203b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 700 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "#d9480f", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>P</div>
          Pakka
        </div>
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "space-between", gap: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 720 }}>
            <div style={{ fontSize: 30, color: "#d9480f", fontWeight: 700, letterSpacing: 3 }}>{view ? "VERIFIED JOB OFFER" : "OFFER NOT FOUND"}</div>
            <div style={{ fontSize: domain.length > 18 ? 64 : 84, fontWeight: 800, marginTop: 12, lineHeight: 1.05 }}>{domain}</div>
            {view && (
              <div style={{ fontSize: 32, color: "#4a5470", marginTop: 24, display: "flex" }}>
                Joining {joining} · {status}
              </div>
            )}
          </div>
          {view && (
            <div
              style={{
                display: "flex",
                border: `4px solid ${bad ? "#c92a2a" : "#1e7f4f"}`,
                borderRadius: 22,
                padding: 6,
                transform: "rotate(-8deg)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  border: `4px solid ${bad ? "#c92a2a" : "#1e7f4f"}`,
                  color: bad ? "#c92a2a" : "#1e7f4f",
                  borderRadius: 14,
                  padding: "8px 32px",
                  fontSize: 72,
                  fontWeight: 800,
                  letterSpacing: 10,
                }}
              >
                PAKKA
              </div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 26, color: "#4a5470", display: "flex" }}>Signed by the company&apos;s own mail servers · recorded onchain</div>
      </div>
    ),
    size,
  );
}
