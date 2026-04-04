/**
 * Phase 1 punch provenance — aligns with `time_entries.punch_source` check constraint.
 */
export const PUNCH_SOURCES = [
  "web",
  "mobile",
  "kiosk",
  "import",
  "manager_edit",
] as const;

export type PunchSource = (typeof PUNCH_SOURCES)[number];

export function isPunchSource(s: string): s is PunchSource {
  return (PUNCH_SOURCES as readonly string[]).includes(s);
}

export function normalizePunchSource(raw: string | null | undefined, fallback: PunchSource = "web"): PunchSource {
  const t = raw?.trim().toLowerCase();
  if (t && isPunchSource(t)) return t;
  return fallback;
}

/** Short label for UI / exports */
export function punchSourceLabel(source: string | null | undefined): string | null {
  if (!source) return null;
  switch (source) {
    case "web":
      return "Web";
    case "mobile":
      return "Mobile";
    case "kiosk":
      return "Kiosk";
    case "import":
      return "Import";
    case "manager_edit":
      return "Manager";
    default:
      return source;
  }
}
