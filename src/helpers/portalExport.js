const ExcelJS = require("exceljs");

// Streams a station portal report as .xlsx or .csv.
//
// columns: [{ header, key, width?, numFmt? }]
// rows: array or async iterable of plain objects keyed by column.key
// meta: [[label, value]] shown above the table in xlsx (station, period, generated at)
// totals: optional object keyed by column.key, written as a bold last row

const safeFileName = (name) => name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");

// Spreadsheet apps execute cells starting with these as formulas (CSV injection).
// Customer names etc. are user-supplied, so neutralise them.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function writeCsv(res, { columns, rows, totals }) {
  const line = (values) => `${values.map(csvCell).join(",")}\r\n`;
  // BOM so Excel opens UTF-8 (Nepali names) correctly
  res.write(`﻿${line(columns.map((c) => c.header))}`);
  for await (const row of rows) {
    res.write(line(columns.map((c) => row[c.key])));
  }
  if (totals) res.write(line(columns.map((c) => totals[c.key])));
  res.end();
}

async function writeXlsx(res, { title, meta, columns, rows, totals }) {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true });
  workbook.creator = "GOEC Station Portal";
  const sheet = workbook.addWorksheet(title.slice(0, 31));
  sheet.columns = columns.map((c) => ({ key: c.key, width: c.width || 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }));

  const titleRow = sheet.addRow([title]);
  titleRow.font = { bold: true, size: 14 };
  titleRow.commit();
  for (const [label, value] of meta) {
    sheet.addRow([label, value]).commit();
  }
  sheet.addRow([]).commit();

  const headerRow = sheet.addRow(columns.map((c) => c.header));
  headerRow.font = { bold: true };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8E8E8" } };
  headerRow.commit();

  for await (const row of rows) {
    sheet.addRow(columns.map((c) => row[c.key])).commit();
  }
  if (totals) {
    const totalsRow = sheet.addRow(columns.map((c) => totals[c.key]));
    totalsRow.font = { bold: true };
    totalsRow.commit();
  }

  sheet.commit();
  await workbook.commit();
}

async function sendReportFile(res, { format, fileName, ...report }) {
  const fullName = `${safeFileName(fileName)}.${format}`;
  res.setHeader(
    "Content-Type",
    format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${fullName}"`);
  res.setHeader("Cache-Control", "no-store");

  if (format === "csv") return writeCsv(res, report);
  return writeXlsx(res, report);
}

module.exports = { sendReportFile };
