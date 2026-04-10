# Object-oriented design — time & attendance (reference)

This document is the **domain model** for employee hours tracking in this repo: **actors**, **core concepts**, **relationships**, and **mapping to implementation** (Supabase, Next.js actions, UI). It complements `.cursor/rules/time-attendance-phases-qa.mdc` (delivery order and QA).

**Scope:** hours, breaks, approvals, and export — **not** tax/withholding or full payroll processing.

---

## 1. System goals

| Goal | Notes |
|------|--------|
| Clock in / out | Multiple channels (e.g. web self-serve); optional **geofence**, **job code**, **punch source** |
| Track time | **Regular** work minutes, **paid/unpaid breaks**, optional **OT** (policy-driven) |
| Manager | View, **adjust** times, **approve** closed punches, record **time off** |
| Timesheets | Period views, **CSV** export for payroll handoff |
| PTO | **Requests** / **records**, **accruals** (ledger) — phased |
| Notifications | Missed punch, OT, approvals — phased |
| Policy | OT rules, caps — **org config**, not hardcoded in UI only |

---

## 2. Actors

| Actor | Responsibilities |
|-------|------------------|
| **Employee** | Clock in/out, breaks, (future) submit PTO; sees own data |
| **Manager** | Roster/time clock **view**, **adjust** punches, **approve**, record **manager time off**, export |
| **Org owner / admin** | **RBAC**, store lead, **security audit** for high-trust changes |
| **Payroll / policy** (conceptual) | OT thresholds, accrual rules — often **data + engine**, not a single “user” in-app |

Implementation note: permissions use `employees.admin_access`, `employees.role`, and `PERMISSIONS` (e.g. `timeclock.manage`). See `lib/rbac/`.

---

## 3. Domain classes (conceptual)

Names below are **domain** names; **physical** storage may be one table, JSON, or computed views.

### 3.1 Organization & place

| Concept | Role |
|---------|------|
| **Organization** | Tenant boundary (implicit in single-org app today) |
| **Location (Store)** | Site for schedules, geofence, time clocks; `locations` |
| **TimeClock** | Named clock device/context per location; `time_clocks` |
| **Employee** | Person; `employees` — `location_id`, role, email link for auth |

### 3.2 Work and actuals

| Concept | Role |
|---------|------|
| **TimeEntry** | One **work session**: clock-in → clock-out; may be **open**; `time_entries` |
| **TimeEntryBreak** | Interval **inside** a work session; paid vs unpaid; `time_entry_breaks` |
| **PunchSource** | How the punch was captured (`web`, `mobile`, etc.) — attribute on **TimeEntry** |
| **GeofenceValidation** | Outcome of comparing GPS to **Location** — enforced in actions, not a separate persisted row per attempt unless you add audit |

### 3.3 Schedule (planned vs actual)

| Concept | Role |
|---------|------|
| **Shift** | Planned start/end (and employee) for variance and “late” badges; `shifts` |
| **Schedule vs actual** | Derived by comparing **Shift** to **TimeEntry** times (enrichment, not a stored aggregate row unless added later) |

### 3.4 Approval & payroll prep

| Concept | Role |
|---------|------|
| **Timesheet (aggregate)** | Logical **rollup** of **TimeEntry** rows over a **pay period** (weekly/monthly/custom). Often **computed** in queries/UI + CSV, not a single `timesheets` row |
| **Approval** | Manager sign-off on a **closed** punch — `approved_at` / `approved_by` on `time_entries` |
| **Edit audit** | Manager **adjust** punch times — `edited_at`, `edit_reason`; may clear approval |

### 3.5 Time off & ledger (target shape)

| Concept | Role |
|---------|------|
| **TimeOffRecord** | Interval away from work (type, optional hours/days, status); `time_off_records` — **manager-logged** (approved) and **employee-request** (`request_source`, **pending** until reviewed) |
| **PTORequest** | Employee-submitted row uses `status` **pending** / **approved** / **denied** and `reviewed_by` / `reviewed_at` when a manager acts (migration `033`). |
| **Accrual / balance** (future) | **Ledger** entries per employee — **not** implemented as first-class tables yet |

### 3.6 Rules & alerts (target shape)

| Concept | Role |
|---------|------|
| **OvertimeRule** | Daily/weekly thresholds, effective dates, possibly role exemptions — **Phase 4**, schema TBD |
| **Notification** | Event + channel (in-app/email) for missed punch, OT, etc. — **Phase 6**, TBD |

### 3.7 Reporting

| Concept | Role |
|---------|------|
| **PayrollExport** | File or payload for provider — **CSV** export implemented; **provider-specific** columns / pay-period **close** — **Phase 7** extension |

---

## 4. Relationships (high level)

```
Location 1──* TimeClock
Location 1──* Employee (primary site; may extend later)
TimeClock 1──* TimeEntry
Employee  1──* TimeEntry
TimeEntry 1──* TimeEntryBreak
Employee  1──* Shift (per location / schedule module)
Employee  1──* TimeOffRecord
Location  1──* TimeOffRecord
```

**OvertimeRule** and **Notification** would attach to **Organization** / **Location** once implemented.

---

## 5. Key use cases (flows)

1. **Clock in** — Authenticate → create **TimeEntry** (open) → optional geofence/job code/source.
2. **Clock out** — Close **TimeEntry**; optionally close open **TimeEntryBreak**.
3. **Break start/end** — Insert/update **TimeEntryBreak** on open **TimeEntry**.
4. **Manager adjust** — Update **TimeEntry** times + reason; clear approval if policy requires.
5. **Manager approve** — Set approval fields on **TimeEntry**.
6. **Manager record time off** — Insert **TimeOffRecord** (approved, `request_source` manager).
6b. **Employee request time off** — Insert **TimeOffRecord** (`request_source` employee, **pending**); manager **approve/deny** updates status and `reviewed_by`.
7. **Export payroll** — Query **TimeEntry** (+ breaks, job codes) for period → **CSV**.

---

## 6. Mapping to this repository

| Domain | Primary persistence / code |
|--------|------------------------------|
| Location, geofence | `locations`, migrations; `lib/time-clock/geofence.ts` |
| TimeClock | `time_clocks`, `app/(dashboard)/time-clock/[clockId]/` |
| TimeEntry | `time_entries`, `app/actions/time-clock.ts`, adjust/approval actions |
| Breaks | `time_entry_breaks`, `lib/time-clock/breaks.ts`, break actions |
| Shift | `shifts`, `lib/time-clock/enrich-punches.ts` |
| Time off (manager) | `time_off_records`, `app/actions/time-off-record.ts`, `lib/time-clock/time-off-display.ts` |
| RBAC / audit | `lib/rbac/`, `lib/audit/security-audit.ts`, `018_security_audit_log.sql` |
| Timesheet period / CSV | `lib/time-clock/timesheet-period.ts`, `lib/time-clock/export-timesheet-csv.ts` |

---

## 7. Alignment with delivery phases

See `.cursor/rules/time-attendance-phases-qa.mdc`. Rough mapping:

| Phase | OOD coverage |
|-------|----------------|
| 1 Punch truth | **TimeEntry** quality + manager edit/approve |
| 2 Breaks | **TimeEntryBreak** |
| 3 Timesheet packet | **Timesheet** as aggregate + **PayrollExport** (CSV) |
| 4 OT | **OvertimeRule** + flags |
| 5 PTO + ledger | **TimeOffRecord**, **PTORequest**, **Accrual** — **partially** (`time_off_records` only) |
| 6 Notifications | **Notification** |
| 7 Payroll export | **PayrollExport** extensions |

---

## 8. Deferred / open (honest scope)

- **OT rules** — waiting on org policy (Phase 4).
- **PTO accruals and balance ledger** — accrual engine not built (Phase 5 remainder). Employee **request + approve/deny** is implemented; **balances** are not.
- **Notifications** (Phase 6).
- **Provider-specific export & pay-period close** (Phase 7).
- **OOD vs implementation:** “**Timesheet**” may remain a **computed** aggregate unless you introduce a persisted `timesheet_id` for locking and payroll handoff.

---

## 9. Revision history

| Date | Change |
|------|--------|
| 2026-04-04 | Initial OOD reference for agent/human handoff |

When phases ship, update **§8** and the **phase rule file** together.
