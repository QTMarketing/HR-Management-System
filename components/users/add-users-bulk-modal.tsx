"use client";

import {
  CalendarDays,
  ChevronDown,
  Columns3,
  FileText,
  RefreshCw,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  PRIMARY_ORANGE_CTA,
  SECONDARY_ORANGE_PILL,
} from "@/lib/ui/primary-orange-cta";
import {
  type DirectoryEmployee,
  bucketForEmployee,
  displayFirst,
  displayLast,
} from "@/lib/users/directory-buckets";

const PHONE_COUNTRIES = [
  { dial: "+1", label: "US", flag: "🇺🇸" },
  { dial: "+44", label: "GB", flag: "🇬🇧" },
  { dial: "+977", label: "NP", flag: "🇳🇵" },
  { dial: "+61", label: "AU", flag: "🇦🇺" },
  { dial: "+91", label: "IN", flag: "🇮🇳" },
  { dial: "+49", label: "DE", flag: "🇩🇪" },
  { dial: "+33", label: "FR", flag: "🇫🇷" },
] as const;

const PAY_OPTIONS = ["Full time policy", "Part time policy", "Contractor policy"] as const;
const TIME_OFF_OPTIONS = ["3 policies", "Standard PTO", "No accrual"] as const;
const SCHEDULE_OPTIONS = ["Full time policy", "Variable hours", "Rotating shifts"] as const;

type OptionalColumnKey =
  | "birthday"
  | "employmentStart"
  | "directManager"
  | "payRules"
  | "timeOff"
  | "schedulingRules";

const OPTIONAL_COLUMNS: { key: OptionalColumnKey; label: string }[] = [
  { key: "birthday", label: "Birthday" },
  { key: "employmentStart", label: "Employment Start Date" },
  { key: "directManager", label: "Direct manager" },
  { key: "payRules", label: "Pay rules" },
  { key: "timeOff", label: "Time off" },
  { key: "schedulingRules", label: "Scheduling rules" },
];

export type BulkUserDraft = {
  id: string;
  firstName: string;
  lastName: string;
  phoneDial: string;
  phoneNational: string;
  birthday: string;
  employmentStart: string;
  directManagerId: string;
  payRules: string;
  timeOff: string;
  schedulingRules: string;
};

function emptyRow(): BulkUserDraft {
  return {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    phoneDial: PHONE_COUNTRIES[2].dial, // NP as in reference
    phoneNational: "",
    birthday: "",
    employmentStart: "",
    directManagerId: "",
    payRules: PAY_OPTIONS[0],
    timeOff: TIME_OFF_OPTIONS[0],
    schedulingRules: SCHEDULE_OPTIONS[0],
  };
}

function rowHasAnyInput(row: BulkUserDraft): boolean {
  return (
    row.firstName.trim() !== "" ||
    row.lastName.trim() !== "" ||
    row.phoneNational.replace(/\D/g, "").trim() !== ""
  );
}

function rowIsComplete(row: BulkUserDraft): boolean {
  return (
    Boolean(row.firstName.trim()) &&
    Boolean(row.lastName.trim()) &&
    Boolean(row.phoneNational.replace(/\D/g, "").trim())
  );
}

function inputClass(short?: boolean) {
  return [
    "rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800",
    "placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20",
    short ? "min-w-0" : "w-full min-w-[120px]",
  ].join(" ");
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: DirectoryEmployee[];
  /** When opening from Admins → Create new user, adjust titles. */
  mode?: "default" | "admin_create";
};

export function AddUsersBulkModal({
  open,
  onOpenChange,
  employees,
  mode = "default",
}: Props) {
  const titleId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [visibleOptional, setVisibleOptional] = useState<Record<OptionalColumnKey, boolean>>(() =>
    Object.fromEntries(OPTIONAL_COLUMNS.map((c) => [c.key, true])) as Record<
      OptionalColumnKey,
      boolean
    >,
  );
  const [rows, setRows] = useState<BulkUserDraft[]>(() => [emptyRow()]);
  const [touched, setTouched] = useState(false);

  const managerOptions = useMemo(() => {
    return employees
      .filter((e) => bucketForEmployee(e) !== "archived")
      .map((e) => ({
        id: e.id,
        label: `${displayFirst(e)} ${displayLast(e)}`.replace(/\s+/g, " ").trim() || e.full_name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [employees]);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!columnsMenuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setColumnsMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [columnsMenuOpen]);

  const addRow = () => setRows((r) => [...r, emptyRow()]);

  const removeRow = (id: string) => {
    setRows((r) => (r.length <= 1 ? r : r.filter((row) => row.id !== id)));
  };

  const updateRow = (id: string, patch: Partial<BulkUserDraft>) => {
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const toggleOptionalColumn = (key: OptionalColumnKey) => {
    setVisibleOptional((v) => ({ ...v, [key]: !v[key] }));
  };

  /** Rows the user started but did not finish — empty spare rows are ignored. */
  const invalidRows = useMemo(
    () => rows.filter((row) => rowHasAnyInput(row) && !rowIsComplete(row)),
    [rows],
  );

  const completeRows = useMemo(() => rows.filter(rowIsComplete), [rows]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (completeRows.length === 0) return;
    if (invalidRows.length > 0) return;
    // Invitations / Supabase insert — wire when backend is ready.
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 backdrop-blur-[2px] sm:p-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="my-4 w-full max-w-[min(92rem,calc(100vw-2rem))] rounded-2xl border border-slate-200/90 bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {mode === "admin_create" ? "Create new user" : "Add users"}
          </h2>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit}>
          <p className="px-5 py-6 text-center text-sm text-slate-600 sm:px-8">
            Users login to the mobile and web app using their mobile phone number.
          </p>

          {touched && (invalidRows.length > 0 || completeRows.length === 0) ? (
            <p className="mx-5 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-950 sm:mx-8">
              {invalidRows.length > 0
                ? "Complete first name, last name, and mobile phone for each row you started, or clear those fields."
                : "Add at least one user with first name, last name, and mobile phone."}
            </p>
          ) : null}

          <div className="overflow-x-auto px-2 pb-2 sm:px-4">
            <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="bg-slate-50/95 text-xs font-semibold tracking-wide text-slate-600">
                  <th className="sticky top-0 z-10 border-b border-slate-200 px-2 py-3 pl-3">
                    First name<span className="text-orange-600">*</span>
                  </th>
                  <th className="sticky top-0 z-10 border-b border-slate-200 px-2 py-3">
                    Last name<span className="text-orange-600">*</span>
                  </th>
                  <th className="sticky top-0 z-10 border-b border-slate-200 px-2 py-3">
                    Mobile phone<span className="text-orange-600">*</span>
                  </th>
                  {OPTIONAL_COLUMNS.map(
                    (c) =>
                      visibleOptional[c.key] && (
                        <th
                          key={c.key}
                          className="sticky top-0 z-10 border-b border-slate-200 px-2 py-3 whitespace-nowrap"
                        >
                          {c.label}
                        </th>
                      ),
                  )}
                  <th
                    className="sticky top-0 z-10 w-12 border-b border-slate-200 px-2 py-3 text-right"
                    aria-label="Column visibility"
                  >
                    <div className="relative flex justify-end pr-1" ref={menuRef}>
                      <button
                        type="button"
                        onClick={() => setColumnsMenuOpen((v) => !v)}
                        className="inline-flex items-center gap-0.5 rounded-md p-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-800"
                        aria-expanded={columnsMenuOpen}
                        title="Show or hide columns"
                      >
                        <Columns3 className="h-4 w-4" />
                        <ChevronDown className="h-3 w-3 opacity-70" />
                      </button>
                      {columnsMenuOpen ? (
                        <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Optional columns
                          </p>
                          {OPTIONAL_COLUMNS.map((c) => (
                            <label
                              key={c.key}
                              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={visibleOptional[c.key]}
                                onChange={() => toggleOptionalColumn(c.key)}
                                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500/30"
                              />
                              {c.label}
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="text-slate-800">
                {rows.map((row, i) => {
                  const flagIncomplete =
                    touched && rowHasAnyInput(row) && !rowIsComplete(row);
                  return (
                  <tr
                    key={row.id}
                    className={i % 2 === 1 ? "bg-slate-50/50" : "bg-white"}
                  >
                    <td className="border-b border-slate-100 px-2 py-2.5 pl-3 align-top">
                      <input
                        className={inputClass()}
                        placeholder="First name"
                        value={row.firstName}
                        onChange={(e) => updateRow(row.id, { firstName: e.target.value })}
                        aria-invalid={
                          flagIncomplete && !row.firstName.trim() ? true : undefined
                        }
                      />
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                      <input
                        className={inputClass()}
                        placeholder="Last name"
                        value={row.lastName}
                        onChange={(e) => updateRow(row.id, { lastName: e.target.value })}
                        aria-invalid={
                          flagIncomplete && !row.lastName.trim() ? true : undefined
                        }
                      />
                    </td>
                    <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                      <div
                        className={`flex min-w-[220px] overflow-hidden rounded-lg border bg-white focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 ${
                          flagIncomplete &&
                          !row.phoneNational.replace(/\D/g, "").trim()
                            ? "border-red-300"
                            : "border-slate-200"
                        }`}
                      >
                        <select
                          className="shrink-0 border-0 bg-slate-50/80 px-2 py-2 text-xs text-slate-700 outline-none"
                          value={row.phoneDial}
                          onChange={(e) =>
                            updateRow(row.id, { phoneDial: e.target.value })
                          }
                          aria-label="Country code"
                        >
                          {PHONE_COUNTRIES.map((c) => (
                            <option key={c.dial} value={c.dial}>
                              {c.flag} {c.dial}
                            </option>
                          ))}
                        </select>
                        <input
                          className="min-w-0 flex-1 border-0 px-2 py-2 text-sm outline-none placeholder:text-slate-400"
                          placeholder="Mobile number"
                          inputMode="tel"
                          value={row.phoneNational}
                          onChange={(e) =>
                            updateRow(row.id, { phoneNational: e.target.value })
                          }
                        />
                      </div>
                    </td>
                    {visibleOptional.birthday && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <div className="relative min-w-[140px]">
                          <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            className={`${inputClass()} w-full pr-9 [&::-webkit-calendar-picker-indicator]:opacity-0`}
                            value={row.birthday}
                            onChange={(e) =>
                              updateRow(row.id, { birthday: e.target.value })
                            }
                          />
                        </div>
                      </td>
                    )}
                    {visibleOptional.employmentStart && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <div className="relative min-w-[160px]">
                          <CalendarDays className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="date"
                            className={`${inputClass()} w-full pr-9 [&::-webkit-calendar-picker-indicator]:opacity-0`}
                            value={row.employmentStart}
                            onChange={(e) =>
                              updateRow(row.id, {
                                employmentStart: e.target.value,
                              })
                            }
                          />
                        </div>
                      </td>
                    )}
                    {visibleOptional.directManager && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <div className="relative min-w-[160px]">
                          <select
                            className={`${inputClass()} w-full appearance-none pr-8`}
                            value={row.directManagerId}
                            onChange={(e) =>
                              updateRow(row.id, {
                                directManagerId: e.target.value,
                              })
                            }
                          >
                            <option value="">Select manager</option>
                            {managerOptions.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        </div>
                      </td>
                    )}
                    {visibleOptional.payRules && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <PolicyCell
                          icon={<FileText className="h-4 w-4 text-slate-500" />}
                          value={row.payRules}
                          options={PAY_OPTIONS}
                          onChange={(v) => updateRow(row.id, { payRules: v })}
                        />
                      </td>
                    )}
                    {visibleOptional.timeOff && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <PolicyCell
                          icon={<Sun className="h-4 w-4 text-amber-500" />}
                          value={row.timeOff}
                          options={TIME_OFF_OPTIONS}
                          onChange={(v) => updateRow(row.id, { timeOff: v })}
                        />
                      </td>
                    )}
                    {visibleOptional.schedulingRules && (
                      <td className="border-b border-slate-100 px-2 py-2.5 align-top">
                        <PolicyCell
                          icon={<FileText className="h-4 w-4 text-slate-500" />}
                          value={row.schedulingRules}
                          options={SCHEDULE_OPTIONS}
                          onChange={(v) =>
                            updateRow(row.id, { schedulingRules: v })
                          }
                        />
                      </td>
                    )}
                    <td className="border-b border-slate-100 px-2 py-2.5 text-right align-top">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 1}
                        className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                        title="Remove row"
                        aria-label="Remove row"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-center px-4 py-4">
            <button
              type="button"
              onClick={addRow}
              className={`${SECONDARY_ORANGE_PILL} inline-flex items-center gap-1.5 px-5 py-2.5 text-sm`}
            >
              + Add another user
            </button>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
            <button
              type="button"
              onClick={close}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="submit" className={`${PRIMARY_ORANGE_CTA} px-5 py-2.5 text-sm`}>
              {mode === "admin_create" ? "Create user" : "Add users"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PolicyCell<T extends string>({
  icon,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  value: string;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="relative min-w-[200px]">
      <span className="pointer-events-none absolute left-2.5 top-1/2 z-[1] -translate-y-1/2">{icon}</span>
      <RefreshCw className="pointer-events-none absolute right-8 top-1/2 z-[1] h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-slate-400" />
      <select
        className="w-full cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-14 text-left text-sm text-slate-800 shadow-sm hover:border-slate-300 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
