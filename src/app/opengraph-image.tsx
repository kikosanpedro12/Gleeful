import { ImageResponse } from "next/og";

/** Share card (Open Graph / Twitter). Generated from text and shapes only: no third-party art or fonts. */
export const alt = "Gleeful: a talking teacher for kids in interactive 3D worlds (early test)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px", background: "linear-gradient(135deg, #f3e7d3 0%, #f3e7d3 55%, #c8552f 100%)", color: "#233238" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: "#c8552f", display: "flex" }} />
          <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>Gleeful</div>
        </div>
        <div style={{ marginTop: 32, fontSize: 44, lineHeight: 1.25, maxWidth: 900 }}>A talking teacher who takes kids into interactive 3D worlds.</div>
        <div style={{ marginTop: 40, fontSize: 28, color: "#5b4636" }}>Grades 1 to 12 · Early test version</div>
      </div>
    ),
    size,
  );
}
