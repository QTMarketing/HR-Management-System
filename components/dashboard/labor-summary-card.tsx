export function LaborSummaryCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-black p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-white">Weekly labor summary</h2>
      <p className="mt-1 text-xs text-white/75">
        Hours and attendance rollup for this location.
      </p>
      <button
        type="button"
        className="mt-4 w-full rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black shadow-sm transition-colors hover:bg-neutral-100"
      >
        View report
      </button>
    </div>
  );
}
