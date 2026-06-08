import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Refreshes the Supabase session cookie.
 * When `NEXT_PUBLIC_AUTH_ENABLED=true`, unauthenticated users are redirected to `/login`
 * (except public routes: login, auth callback, set-password, forgot-password). Signed-in users
 * hitting `/login` are sent to `next` or `/`.
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const signupPaths = new Set(["/signup", "/sign-up", "/register"]);
  if (signupPaths.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
  if (!authEnabled) {
    return supabaseResponse;
  }

  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/auth/sso/consume") ||
    pathname === "/set-password" ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/api/internal/assistant/") ||
    pathname.startsWith("/api/cron/");

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const fullPath = pathname + request.nextUrl.search;
    loginUrl.searchParams.set("next", fullPath === "/" ? "/" : fullPath);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const nextRaw = request.nextUrl.searchParams.get("next");
    const dest = safeNextPath(nextRaw ?? undefined);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return supabaseResponse;
}
