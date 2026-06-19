import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHubAuthUser } from "@/lib/auth/ensure-hub-auth-user";
import { verifyHubSsoToken } from "@/lib/auth/hub-sso";
import { resolveHubSsoAccount } from "@/lib/auth/resolve-hub-sso-account";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Hub SSO handoff — verify JWT, resolve HubAccountLink, mint Supabase session. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token = searchParams.get("token");
  const next = safeNextPath(searchParams.get("next"));

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=sso_missing_token`);
  }

  const secret = process.env.SSO_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.redirect(`${origin}/login?error=sso_not_configured`);
  }

  const payload = verifyHubSsoToken(token, secret);
  if (!payload) {
    return NextResponse.redirect(`${origin}/login?error=sso_invalid_token`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=sso_not_configured`);
  }

  const admin = createSupabaseAdminClient();
  if (!admin) {
    return NextResponse.redirect(`${origin}/login?error=sso_not_configured`);
  }

  let sessionEmail = payload.email.trim().toLowerCase();

  if (process.env.RBAC_ENABLED === "true") {
    const resolved = await resolveHubSsoAccount(admin, {
      sub: payload.sub,
      email: payload.email,
    });

    if (!resolved.ok) {
      return NextResponse.redirect(`${origin}/login?error=${resolved.code}`);
    }

    sessionEmail = resolved.account.email;
    console.log("[HR_SSO] Account resolved", {
      hubUserId: payload.sub,
      employeeId: resolved.account.employeeId,
      linkedVia: resolved.account.linkedVia,
      email: sessionEmail,
    });
  }

  const ensured = await ensureHubAuthUser(admin, sessionEmail);
  if (!ensured.ok) {
    console.error("[HR_SSO] ensure auth user failed", {
      email: sessionEmail,
      message: ensured.message,
    });
    return NextResponse.redirect(`${origin}/login?error=sso_auth_user`);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: sessionEmail,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    console.error("[HR_SSO] generateLink failed", {
      email: sessionEmail,
      error: linkErr?.message,
    });
    return NextResponse.redirect(`${origin}/login?error=sso_session_failed`);
  }

  let response = NextResponse.redirect(new URL(next, origin));

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.redirect(new URL(next, origin));
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error: otpErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: hashedToken,
  });

  if (otpErr) {
    console.error("[HR_SSO] verifyOtp failed", {
      email: sessionEmail,
      error: otpErr.message,
    });
    return NextResponse.redirect(`${origin}/login?error=sso_session_failed`);
  }

  console.log("[HR_SSO] Session established", {
    email: sessionEmail,
    sub: payload.sub,
  });
  return response;
}
