import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ForgotPasswordForm } from "./forgot-password-form";
import { authEnabled } from "@/lib/auth/config";

export default function ForgotPasswordPage() {
  if (!authEnabled) {
    redirect("/");
  }
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
          HR
        </span>
        <span className="text-lg font-semibold text-slate-800">Retail HR</span>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <ForgotPasswordForm />
      </Suspense>
    </div>
  );
}
