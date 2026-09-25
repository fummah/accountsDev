/**
 * csv.js — the ONE CSV serializer/downloader used by list exports.
 *
 * RFC 4180 escaping: a value containing a comma, a double quote, CR or LF is
 * wrapped in double quotes, and embedded quotes are doubled. This keeps
 * "Smith, Jones & Sons", `He said "Hello"` and multi-line notes in a single
 * column. A UTF-8 BOM is prepended so Excel opens accented names (José,
 * François, Müller) correctly.
 */

/** Escape one CSV field. */
export const csvEscape = (value) => {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Build a CSV document from human-readable headers + a matrix of rows. */
export const toCsv = (headers, rows) =>
  [headers, ...(rows || [])]
    .map(cols => (cols || []).map(csvEscape).join(','))
    .join('\r\n');

/**
 * Trigger a browser/Electron download of a CSV. In Electron the default
 * download behaviour shows the OS "Save As" dialog, so the user chooses where
 * the file goes (never a source/app.asar path).
 */
export const downloadCsv = (filename, csv) => {
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/** yyyy-mm-dd for a filename / date cell, or '' when unparseable. */
export const csvDate = (value) => {
  if (value == null || value === '') return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toISOString().slice(0, 10);
};
