import { ImageResponse } from "next/og";

/**
 * Branded favicon — orange gradient square with "HR" wordmark, matching the
 * login-page header lockup (bg-gradient-to-br from-orange-400 to-orange-600).
 * Replaces the default Next.js starter favicon.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #fb923c 0%, #ea580c 100%)",
          color: "white",
          fontWeight: 800,
          fontSize: 18,
          letterSpacing: -0.5,
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        HR
      </div>
    ),
    size,
  );
}
