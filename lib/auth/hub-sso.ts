import { createHmac, timingSafeEqual } from "crypto";

export type HubSsoAudience = "staff-operations";

export interface HubSsoPayload {
  iss: "quicktrack-hub";
  aud: HubSsoAudience;
  sub: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "STAFF";
  iat: number;
  exp: number;
}

function base64UrlDecode(value: string): Buffer {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function base64UrlDecodeJson<T>(value: string): T {
  return JSON.parse(base64UrlDecode(value).toString("utf8")) as T;
}

/** Verify Hub-issued HS256 JWT for Staff Operations SSO. */
export function verifyHubSsoToken(token: string, secret: string): HubSsoPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  let header: { alg?: string };
  try {
    header = base64UrlDecodeJson<{ alg?: string }>(encodedHeader);
  } catch {
    return null;
  }

  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", secret).update(signingInput).digest();
  let actual: Buffer;
  try {
    actual = base64UrlDecode(encodedSignature);
  } catch {
    return null;
  }

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let payload: HubSsoPayload;
  try {
    payload = base64UrlDecodeJson<HubSsoPayload>(encodedPayload);
  } catch {
    return null;
  }

  if (payload.iss !== "quicktrack-hub") return null;
  if (payload.aud !== "staff-operations") return null;
  if (!payload.sub?.trim() || !payload.email?.trim()) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;

  return payload;
}
