import Link from "next/link";
import { PRIMARY_ORANGE_CTA } from "@/lib/ui/primary-orange-cta";

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-slate-800">Access restricted</h1>
      <p className="text-sm text-slate-600">
        Your role doesn&apos;t include permission to view this page. Contact a store manager if you
        need access.
      </p>
      <Link
        href="/"
        className={`inline-flex ${PRIMARY_ORANGE_CTA} px-4 py-2 text-sm font-medium`}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
