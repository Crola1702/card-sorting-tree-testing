// CSV writer used by scripts/export.mjs.

// Prefixing "'" stops spreadsheets from running participant text such as "=HYPERLINK(...)" as a formula.
export function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

// BOM so Excel opens accents correctly; CRLF as RFC 4180 says.
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns, ...rows.map((r) => columns.map((c) => r[c]))].map((r) => r.map(csvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
