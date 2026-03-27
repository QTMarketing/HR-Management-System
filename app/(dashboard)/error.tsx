"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200 bg-red-50/50 px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-slate-800">Something went wrong</h2>
      <p className="mt-2 max-w-md text-sm text-slate-600">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover"
      >
        Try again
      </button>
    </div>
  );
}
