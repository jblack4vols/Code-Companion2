/**
 * Shared CSV/XLSX cell parsers for import routes (claims, unit-economics).
 * Single source of truth — previously duplicated (and drifting) across
 * routes/revenue-recovery.ts and routes/unit-economics.ts.
 */

/** Strip currency formatting ($ , whitespace) and convert a cell to a number. */
export function parseNum(val: any): number {
  if (typeof val === "number") return val;
  if (typeof val === "string") return parseFloat(val.replace(/[$,\s]/g, "")) || 0;
  return 0;
}

/** Normalize a date cell (Date, Excel serial, ISO, or M/D/YYYY) to YYYY-MM-DD, else null. */
export function parseDateValue(val: any): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  if (typeof val === "number") {
    const utcDays = Math.floor(val - 25569);
    return new Date(utcDays * 86400000).toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    const yr = y.length === 2 ? "20" + y : y;
    return `${yr}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
}
