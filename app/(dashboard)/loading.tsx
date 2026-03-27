export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-[1600px] animate-pulse space-y-6">
      <div className="h-14 rounded-lg bg-slate-200/80" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/80" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-72 rounded-2xl bg-slate-200/80 lg:col-span-2" />
        <div className="h-72 rounded-2xl bg-slate-200/80" />
      </div>
    </div>
  );
}
