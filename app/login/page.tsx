import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { authEnabled } from "@/lib/auth/config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!authEnabled) {
    redirect("/");
  }

  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="mb-8 flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 text-sm font-bold text-white shadow-sm">
          HR
        </span>
        <span className="text-lg font-semibold text-slate-800">Retail HR</span>
      </div>
      <LoginForm initialError={error} />
    </div>
  );
}
