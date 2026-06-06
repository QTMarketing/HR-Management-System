import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ensureHubAuthUser } from "@/lib/auth/ensure-hub-auth-user";
import { verifyHubSsoToken } from "@/lib/auth/hub-sso";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Hub SSO handoff — verify JWT and mint Supabase session cookies. */
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

  const email = payload.email.trim().toLowerCase();

  if (process.env.RBAC_ENABLED === "true") {
    const { data: employee, error: empErr } = await admin
      .from("employees")
      .select("id, status")
      .ilike("email", email)
      .maybeSingle();

    if (empErr || !employee || employee.status !== "active") {
      return NextResponse.redirect(`${origin}/login?error=sso_no_employee`);
    }
  }

  const ensured = await ensureHubAuthUser(admin, email);
  if (!ensured.ok) {
    console.error("[HR_SSO] ensure auth user failed", { email, message: ensured.message });
    return NextResponse.redirect(`${origin}/login?error=sso_auth_user`);
  }

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const hashedToken = linkData?.properties?.hashed_token;
  if (linkErr || !hashedToken) {
    console.error("[HR_SSO] generateLink failed", { email, error: linkErr?.message });
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
    type: "email",
    email,
    token: hashedToken,
  });

  if (otpErr) {
    console.error("[HR_SSO] verifyOtp failed", { email, error: otpErr.message });
    return NextResponse.redirect(`${origin}/login?error=sso_session_failed`);
  }

  console.log("[HR_SSO] Session established", { email, sub: payload.sub });
  return response;
}
