"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.refresh();
    router.push("/login");
    setLoading(false);
  }

  return (
    <button
      type="button"
      onClick={() => void signOut()}
      disabled={loading}
      className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
