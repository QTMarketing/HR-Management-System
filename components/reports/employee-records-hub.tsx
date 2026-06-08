"use client";

import { useState, type ReactNode } from "react";
import { ReportPreviewSheet } from "@/components/reports/report-preview-sheet";
import type { EmployeeRecordReportId } from "@/lib/reports/report-filters";
import {
  Activity,
  Building2,
  CalendarRange,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Shield,
  Users,
  Wallet,
} from "lucide-react";

export type EmployeeRecordsHubProps = {
  locationId: string;
  scopeAll: boolean;
  scopeLabel: string;
  year: number;
  permissions: {
    usersView: boolean;
    timeOffManage: boolean;
    laborReport: boolean;
    orgOwner: boolean;
    scheduleView: boolean;
    activityView: boolean;
  };
};

type ReportCard = {
  id: EmployeeRecordReportId;
  icon: ReactNode;
  title: string;
  description: string;
  tier: "Core" | "Operations" | "Governance";
  enabled: boolean;
  disabledReason?: string;
};

export function EmployeeRecordsHub({
  locationId,
  scopeAll,
  scopeLabel,
  year,
  permissions,
}: EmployeeRecordsHubProps) {
  const [activeReport, setActiveReport] = useState<ReportCard | null>(null);
  const scope = { locationId, scopeAll, scopeLabel };

  const cards: ReportCard[] = [
    {
      id: "directory",
      icon: <Users className="h-5 w-5 text-orange-600" />,
      title: "Employee directory",
      description: "Active employees with contact info, role, store, and hire date.",
      tier: "Core",
      enabled: permissions.usersView,
    },
    {
      id: "hr-record",
      icon: <ClipboardList className="h-5 w-5 text-orange-600" />,
      title: "Employee HR record",
      description: "Full roster with department, team, position, and employee codes for filing.",
      tier: "Core",
      enabled: permissions.usersView,
    },
    {
      id: "time-off",
      icon: <Wallet className="h-5 w-5 text-emerald-600" />,
      title: "Time off balances",
      description: "Vacation and sick balances by calendar year.",
      tier: "Core",
      enabled: permissions.timeOffManage,
    },
    {
      id: "stores",
      icon: <Building2 className="h-5 w-5 text-amber-700" />,
      title: "Store directory",
      description: "All stores with status and assigned store lead.",
      tier: "Core",
      enabled: permissions.usersView,
    },
    {
      id: "labor",
      icon: <FileSpreadsheet className="h-5 w-5 text-sky-600" />,
      title: "Weekly labor summary",
      description: "Scheduled vs worked hours for a selected week, by employee.",
      tier: "Operations",
      enabled: permissions.laborReport,
    },
    {
      id: "schedule",
      icon: <CalendarRange className="h-5 w-5 text-violet-600" />,
      title: "Weekly schedule roster",
      description: "Published and draft shifts for a selected week.",
      tier: "Operations",
      enabled: permissions.scheduleView,
    },
    {
      id: "activity",
      icon: <Activity className="h-5 w-5 text-slate-600" />,
      title: "Activity log",
      description: "Clock and attendance events for a date range.",
      tier: "Operations",
      enabled: permissions.activityView,
    },
    {
      id: "audit",
      icon: <Shield className="h-5 w-5 text-rose-600" />,
      title: "Security audit log",
      description: "Owner actions: permissions, promotions, and store lead changes.",
      tier: "Governance",
      enabled: permissions.orgOwner,
      disabledReason: "Organization owners only",
    },
    {
      id: "pto-auto",
      icon: <ClipboardList className="h-5 w-5 text-orange-600" />,
      title: "PTO automation history",
      description: "Scheduled and manual year-end resets and vacation payouts.",
      tier: "Governance",
      enabled: permissions.orgOwner,
      disabledReason: "Organization owners only",
    },
  ];

  const tiers = ["Core", "Operations", "Governance"] as const;

  return (
    <>
      <div className="space-y-6">
        <p className="text-xs text-slate-500">
          Click a report to open a spreadsheet-style preview. Choose the period inside the preview, then download
          CSV or print.
        </p>
        {tiers.map((tier) => {
          const tierCards = cards.filter((c) => c.tier === tier);
          if (tierCards.length === 0) return null;
          return (
            <section key={tier}>
              <h2 className="text-sm font-semibold text-slate-900">{tier} reports</h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Scope: <span className="font-medium text-slate-700">{scopeLabel}</span>
              </p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {tierCards.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    disabled={!card.enabled}
                    title={card.enabled ? "Open report preview" : card.disabledReason}
                    onClick={() => card.enabled && setActiveReport(card)}
                    className={`group rounded-xl border bg-white p-4 text-left shadow-sm transition ${
                      card.enabled
                        ? "border-slate-200 hover:border-orange-300 hover:shadow-md"
                        : "cursor-not-allowed border-slate-100 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-50 group-hover:bg-orange-50">
                        {card.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                          {card.enabled ? (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-orange-500" />
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-600">{card.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {activeReport ? (
        <ReportPreviewSheet
          open
          onClose={() => setActiveReport(null)}
          reportId={activeReport.id}
          title={activeReport.title}
          description={activeReport.description}
          scope={scope}
          defaultYear={year}
        />
      ) : null}
    </>
  );
}
