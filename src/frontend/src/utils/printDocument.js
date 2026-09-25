/**
 * printDocument.js — the ONE helper for opening a clean, self-contained print
 * document. It writes a full HTML string into a blank window and calls the
 * system print dialog — the same approach Check Printing, General Ledger and
 * Purchase Orders already use, so printing behaves identically everywhere and
 * needs no dev-server/asar/localhost resources (all styles are inline).
 *
 * The HTML must be self-contained: no external CSS/JS, so it works in the
 * packaged Windows app exactly as in development.
 */

/** Base print styles shared by every printed document/report. */
export const PRINT_BASE_CSS = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; font-size: 12px; margin: 0; padding: 0; }
  .doc { padding: 28px 32px; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 16px; margin: 0 0 8px; }
  .muted { color: #666; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
  .meta { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  .section-title { margin-top: 20px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
  .summary { margin-top: 12px; margin-left: auto; width: 320px; }
  .summary .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .summary .row.total { border-top: 2px solid #333; margin-top: 4px; padding-top: 6px; font-weight: 700; }
  .badge { display: inline-block; border: 1px solid #999; border-radius: 10px; padding: 1px 10px; font-size: 11px; }
  .badge.draft { border-color: #d46b08; color: #d46b08; }
  .badge.ok { border-color: #237804; color: #237804; }
  @page { margin: 0.5in; size: auto; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
`;

/** Open a self-contained HTML document in a print window and trigger print. */
export const printHtml = (html) => {
  const w = window.open('', '_blank', 'width=920,height=720');
  if (!w) return null;
  w.document.open();
  w.document.write(html);
  w.document.close();
  const doPrint = () => { try { w.focus(); w.print(); } catch (e) { /* user cancelled */ } };
  if (w.document.readyState === 'complete') setTimeout(doPrint, 300);
  else w.onload = () => setTimeout(doPrint, 300);
  return w;
};

export default printHtml;
