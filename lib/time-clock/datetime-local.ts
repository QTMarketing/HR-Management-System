/** Bridge browser `datetime-local` values and ISO strings for server actions. */

export function isoToDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function datetimeLocalValueToIso(value: string): string {
  const t = Date.parse(value);
  if (Number.isNaN(t)) return "";
  return new Date(t).toISOString();
}

/** `YYYY-MM-DD` from `<input type="date">` → ISO start of local calendar day. */
export function dateYmdToLocalDayStartIso(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return "";
  const dt = new Date(y, mo - 1, d, 0, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}

/** `YYYY-MM-DD` from `<input type="date">` → ISO end of local calendar day. */
export function dateYmdToLocalDayEndIso(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return "";
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return "";
  const dt = new Date(y, mo - 1, d, 23, 59, 59, 999);
  if (Number.isNaN(dt.getTime())) return "";
  return dt.toISOString();
}
