// Build an RFC-4180 CSV string for clean import into Google Sheets / Excel.
//
// columns: array of { header, key?, value? }
//   - key: pulls row[key]
//   - value: function (row) => any; takes precedence over key when both are set
//   - both can be paired with a format function on a key column: { key, header, format(v, row) }

const escape = (val) => {
  if (val === null || val === undefined) return '';
  const s = String(val);
  // Strip stray carriage returns that some platforms intermix; preserve LF inside fields.
  const cleaned = s.replace(/\r/g, '');
  if (/[",\n]/.test(cleaned)) return '"' + cleaned.replace(/"/g, '""') + '"';
  return cleaned;
};

export function toCSV(rows, columns) {
  const header = columns.map(c => escape(c.header)).join(',');
  const lines = rows.map(row =>
    columns.map(c => {
      let v;
      if (typeof c.value === 'function') v = c.value(row);
      else if (c.format) v = c.format(row[c.key], row);
      else v = row[c.key];
      return escape(v);
    }).join(',')
  );
  // CRLF line endings + trailing newline — what Sheets/Excel both expect.
  return [header, ...lines].join('\r\n') + '\r\n';
}

export function downloadCSV(filename, csv) {
  // Prepend a UTF-8 BOM so Excel detects the encoding correctly (Sheets ignores it).
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}
