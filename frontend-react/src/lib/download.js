/** Real client-side exports built from data already loaded from the API. */

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** columns: [{ label, value: (row) => any }] */
export function toCsv(columns, rows) {
  const head = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(c.value(r))).join(','));
  return [head, ...body].join('\r\n');
}

export function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([mime.startsWith('text/csv') ? `﻿${text}` : text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCsv(filename, columns, rows) {
  downloadText(filename, toCsv(columns, rows));
}

export function downloadJson(filename, value) {
  downloadText(filename, JSON.stringify(value, null, 2), 'application/json');
}

export function printPage() {
  window.print();
}

export function fileStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}
