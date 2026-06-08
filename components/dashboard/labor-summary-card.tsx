import Link from "next/link";

export function LaborSummaryCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-black p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-white">Employee records</h2>
      <p className="mt-1 text-xs text-white/75">
        Download rosters, time off balances, labor hours, and audit reports — CSV or print-ready PDF.
      </p>
      <Link
        href="/reports/employee-records"
        className="mt-4 flex w-full items-center justify-center rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-neutral-100"
      >
        Open reports
      </Link>
    </div>
  );
}
