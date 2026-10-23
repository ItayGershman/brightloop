// Rows as CSV (RFC 4180): a header line, one line per row, CRLF line ends. A cell with a
// comma, a quote or a line break is quoted and its quotes doubled. Cells are outside text
// (ADR-0001), so one a spreadsheet would run as a formula (starting =, +, -, @, tab or CR)
// gets a leading apostrophe and is read as text when Maya opens or imports the file.

const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;

export function toCsv(header: readonly string[], rows: string[][]): string {
  return [header, ...rows].map((row) => `${row.map(cell).join(",")}\r\n`).join("");
}

function cell(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
