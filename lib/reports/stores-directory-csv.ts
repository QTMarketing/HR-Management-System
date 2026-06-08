export type StoreDirectoryCsvRow = {
  id: string;
  name: string;
  status: string;
  storeLeadName: string;
};

const HEADERS = ["Store ID", "Store name", "Status", "Store lead"] as const;

function csvCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildStoresDirectoryCsv(rows: StoreDirectoryCsvRow[]): string {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of sorted) {
    lines.push([r.id, r.name, r.status, r.storeLeadName].map(csvCell).join(","));
  }
  return lines.join("\r\n");
}
