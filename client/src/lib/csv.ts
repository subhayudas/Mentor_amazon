/**
 * CSV helpers: rows -> RFC 4180 text (with a UTF-8 BOM so Excel opens Arabic
 * names correctly) plus a browser download helper. Pure, no React.
 */

export type CsvValue = string | number | boolean | null | undefined;

const BOM = "﻿";
const LINE_BREAK = "\r\n";

/** Quote a single cell. Formula-looking strings are neutralised so a name like
 *  "=HYPERLINK(...)" cannot execute when the file is opened in a spreadsheet. */
export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface ToCsvOptions {
  /** Lines emitted verbatim before the header, each prefixed with "# ". */
  commentLines?: string[];
  /** Include the UTF-8 BOM (default true; Excel needs it for non-ASCII text). */
  bom?: boolean;
}

export function toCsv(headers: string[], rows: CsvValue[][], options: ToCsvOptions = {}): string {
  const { commentLines = [], bom = true } = options;
  const lines: string[] = [];
  commentLines.forEach((line) => lines.push(`# ${line}`));
  lines.push(headers.map(escapeCsvCell).join(","));
  rows.forEach((row) => lines.push(row.map(escapeCsvCell).join(",")));
  return (bom ? BOM : "") + lines.join(LINE_BREAK) + LINE_BREAK;
}

/** mentorconnect-bookings-2026-09-19.csv (or a range: ...-2026-08-20_to_2026-09-19.csv). */
export function csvFilename(prefix: string, from: Date, to?: Date, demo = false): string {
  const stamp = to ? `${isoDate(from)}_to_${isoDate(to)}` : isoDate(from);
  return `${demo ? "DEMO-" : ""}${prefix}-${stamp}.csv`;
}

export function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
