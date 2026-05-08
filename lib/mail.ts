/**
 * Transactional email helper backed by Resend.
 *
 * Designed to be safe-by-default:
 *   - When `RESEND_API_KEY` is missing, `sendHREmail` is a no-op that logs
 *     a warning. Server actions that call it will not throw — useful so
 *     local dev and CI don't require a live email account.
 *   - The Resend client is lazy-singletoned so the SDK is only imported
 *     when actually sending mail. Keeps the cold-start hit off code paths
 *     that never send (most read traffic).
 *   - All public functions return a `MailResult` discriminated union so
 *     callers can decide whether to surface failures (most do not — email
 *     receipts are non-blocking by design).
 *
 * Server-only — do NOT import from a client component.
 */

import "server-only";
import { Resend } from "resend";

export type MailResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string; skipped?: boolean };

export type SendHREmailInput = {
  /** Single recipient or list of recipients. Empty arrays are treated as no-op. */
  to: string | string[];
  subject: string;
  /** Pre-rendered HTML. Use the helpers below to keep markup consistent. */
  html: string;
  /** Optional override sender. Defaults to env `RESEND_FROM` or sandbox. */
  from?: string;
};

const FALLBACK_FROM = "HR Notifications <onboarding@resend.dev>";

let _resend: Resend | null = null;
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;
  if (_resend) return _resend;
  _resend = new Resend(key);
  return _resend;
}

function normalizeRecipients(to: string | string[]): string[] {
  const arr = Array.isArray(to) ? to : [to];
  return arr.map((s) => s.trim()).filter((s) => s.length > 0 && s.includes("@"));
}

/**
 * Send a transactional HR email. Returns `ok: true` even if no API key is
 * configured — but `skipped: true` is set so callers can distinguish the
 * "intentionally not sent" case during tests.
 */
export async function sendHREmail(input: SendHREmailInput): Promise<MailResult> {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    return { ok: false, error: "No valid recipient.", skipped: true };
  }

  const resend = getResend();
  if (!resend) {
    // Soft no-op for dev/CI. Log enough to debug missing-key cases.
    console.warn(
      "[mail] RESEND_API_KEY not set — skipping email. subject=",
      input.subject,
      "to=",
      recipients.join(", "),
    );
    return { ok: false, error: "RESEND_API_KEY is not configured.", skipped: true };
  }

  const from =
    input.from?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    FALLBACK_FROM;

  try {
    const { data, error } = await resend.emails.send({
      from,
      to: recipients,
      subject: input.subject,
      html: input.html,
    });
    if (error) {
      console.error("[mail] resend send failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown email error";
    console.error("[mail] resend threw:", msg);
    return { ok: false, error: msg };
  }
}

/** Minimal HTML escape so user-provided notes don't blow up the markup. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders a tiny, brand-consistent email shell. Keep this dead simple —
 * fancy CSS is brittle in email clients and `richColors` toasts already
 * cover in-app feedback. The goal here is "paper trail", not magazine layout.
 */
export function renderHREmail({
  preheader,
  title,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footnote,
}: {
  preheader: string;
  title: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
}): string {
  const cta =
    ctaLabel && ctaUrl
      ? `<p style="margin:24px 0 0">
           <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">
             ${escapeHtml(ctaLabel)}
           </a>
         </p>`
      : "";
  const foot = footnote
    ? `<p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.5">${escapeHtml(footnote)}</p>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
    <span style="display:none;color:#f8fafc;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
            <tr>
              <td style="padding:24px 28px 8px">
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c">HR Notifications</p>
                <h1 style="margin:8px 0 0;font-size:20px;line-height:1.3;color:#0f172a">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 28px 24px;font-size:14px;line-height:1.6;color:#334155">
                ${bodyHtml}
                ${cta}
                ${foot}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
