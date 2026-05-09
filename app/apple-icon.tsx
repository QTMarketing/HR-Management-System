import { ImageResponse } from "next/og";

/**
 * iOS / iPadOS home-screen icon — same lockup as `app/icon.tsx` at 180×180.
 * Renders the orange gradient + "HR" wordmark used on the login page.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function AppleIcon() {
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
          fontSize: 96,
          letterSpacing: -2,
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
