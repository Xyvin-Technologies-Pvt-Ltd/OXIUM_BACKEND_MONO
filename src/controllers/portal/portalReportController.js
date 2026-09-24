const createError = require("http-errors");
const EvMachine = require("../../models/evMachineSchema");
const ChargingStation = require("../../models/chargingStationSchema");
const User = require("../../models/userSchema");
const OcppTransactionView = require("../../models/ocppTransactionView");
const { logPortalEvent } = require("../../helpers/portalAudit");
const { sendReportFile } = require("../../helpers/portalExport");
const {
  getOverviewPipeline,
  getChargingSummaryPipeline,
  getFinancePipeline,
  getTransactionsPipeline,
  getTransactionRowsPipeline,
} = require("./pipes");
const {
  portalOverviewQuerySchema,
  portalChargingSummaryQuerySchema,
  portalFinanceQuerySchema,
  portalTransactionsQuerySchema,
  withPortalExportFormat,
} = require("../../validation");

// Station reports for the portal. Every handler scopes by req.stationId (set by
// portalAuth from the signed-in user) — never by anything in the request.

const MAX_RANGE_DAYS = 366;
const MAX_EXPORT_ROWS = 50000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Nepal has no DST, so a fixed UTC+05:45 offset is exact. Report days are Nepal days.
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

//! ---------- helpers

function parseQuery(schema, query) {
  const { error, value } = schema.validate(query, { stripUnknown: true });
  if (error) {
    throw createError(400, error.details.map((detail) => detail.message).join(", "));
  }
  return value;
}

function utcMidnight(dateString, label) {
  const [y, m, d] = dateString.split("-").map(Number);
  const time = Date.UTC(y, m - 1, d);
  const date = new Date(time);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw createError(400, `"${label}" is not a valid date`);
  }
  return time;
}

// Inclusive Nepal-local day range -> [fromDate, toDate) in UTC
function resolveDateRange(startDate, endDate) {
  const start = utcMidnight(startDate, "startDate");
  const end = utcMidnight(endDate, "endDate");
  if (end < start) throw createError(400, "End date cannot be before start date");

  const days = (end - start) / DAY_MS + 1;
  if (days > MAX_RANGE_DAYS) {
    throw createError(400, `Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return {
    fromDate: new Date(start - NEPAL_OFFSET_MS),
    toDate: new Date(end + DAY_MS - NEPAL_OFFSET_MS),
    startMs: start,
    days,
  };
}

const isoDay = (utcMs) => new Date(utcMs).toISOString().slice(0, 10);

// Nepal-local "YYYY-MM-DD HH:mm" for exports
const nepalDateTime = (date) =>
  date ? new Date(new Date(date).getTime() + NEPAL_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ") : "";

async function loadStationScope(req, cpid) {
  const chargers = await EvMachine.find({ location_name: req.stationId }, "name CPID").lean();
  if (cpid && !chargers.some((charger) => charger.CPID === cpid)) {
    // A charger since moved elsewhere can still be filtered on for the sessions it
    // recorded at this station
    const chargedHere = await OcppTransactionView.exists({ stationId: req.stationId, cpid });
    if (!chargedHere) throw createError(400, "Unknown charger for this station");
  }
  const names = new Map(chargers.map((charger) => [charger.CPID, charger.name]));
  return {
    chargers,
    cpids: chargers.map((charger) => charger.CPID),
    chargerName: (id) => (names.get(id) ? `${names.get(id)} (${id})` : id),
    rawName: (id) => names.get(id) || "",
  };
}

async function buildScope(req, query) {
  const range = resolveDateRange(query.startDate, query.endDate);
  const scope = await loadStationScope(req, query.cpid);
  const params = {
    stationId: req.stationId,
    cpids: scope.cpids,
    fromDate: range.fromDate,
    toDate: range.toDate,
    cpid: query.cpid,
  };
  return { range, scope, params };
}

const money = (n) => Math.round((Number(n) || 0) * 100) / 100;
const kwh = (n) => Math.round((Number(n) || 0) * 1000) / 1000;
const whole = (n) => Math.round(Number(n) || 0);

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

const countCustomers = (users) => (users || []).filter(Boolean).length;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function groupLabel(groupBy, id, scope) {
  if (groupBy === "charger") return { key: id, label: scope.chargerName(id), cpid: id };
  if (groupBy === "connector") {
    return {
      key: `${id.cpid}#${id.connectorId}`,
      label: `${scope.chargerName(id.cpid)} - Connector ${id.connectorId}`,
      cpid: id.cpid,
      connectorId: id.connectorId,
    };
  }
  return { key: id, label: id };
}

const formatUsage = (g = {}) => {
  const sessions = g.sessions || 0;
  return {
    sessions,
    energyKwh: kwh(g.energyKwh),
    revenue: money(g.gross),
    durationSeconds: whole(g.durationSeconds),
    avgDurationSeconds: sessions ? whole(g.durationSeconds / sessions) : 0,
    avgEnergyKwh: sessions ? kwh(g.energyKwh / sessions) : 0,
    customers: countCustomers(g.customers),
  };
};

const formatFinance = (g = {}) => ({
  sessions: g.sessions || 0,
  energyKwh: kwh(g.energyKwh),
  billedKwh: kwh(g.billedKwh),
  unbilledKwh: kwh(g.unbilledKwh),
  energyCharges: money(g.energyCharges),
  taxAmount: money(g.taxAmount),
  serviceFees: money(g.serviceFees),
  gross: money(g.gross),
  walletDeducted: money(g.walletDeducted),
  difference: money((g.gross || 0) - (g.walletDeducted || 0)),
  mobileSessions: g.mobileSessions || 0,
  mobileGross: money(g.mobileGross),
  rfidSessions: g.rfidSessions || 0,
  rfidGross: money(g.rfidGross),
});

function formatTransaction(row, scope) {
  const user = row._user && row._user[0];
  return {
    transactionId: row.transactionId,
    startTime: row.startTime,
    endTime: row.endTime,
    date: row.day,
    charger: { cpid: row.cpid, name: scope.rawName(row.cpid) },
    connectorId: row.connectorId,
    transactionMode: row.transactionMode || "",
    customer: { name: user?.username || "", mobile: user?.mobile || "", email: user?.email || "" },
    rfidTag: row.transactionMode === "rfid" ? row.idtag || "" : "",
    durationSeconds: whole(row.durationSeconds),
    duration: formatDuration(row.durationSeconds),
    energyKwh: kwh(row.energyKwh),
    unbilledKwh: kwh(row.unbilledKwh),
    tariffRate: money(row.tariffRate),
    taxPercent: money(row.taxRate * 100),
    energyCharges: money(row.energyCharges),
    taxAmount: money(row.taxAmount),
    serviceFee: money(row.serviceFee),
    totalAmount: money(row.gross),
    walletDeducted: money(row.walletDeducted),
    startSoc: row.startSoc ?? null,
    endSoc: row.currentSoc ?? null,
    stopReason: row.closureReason || "",
    closedBy: row.closeBy || "",
  };
}

async function aggregateOne(pipeline) {
  const [result] = await OcppTransactionView.aggregate(pipeline, { allowDiskUse: true });
  return result || {};
}

// Matches the session id, RFID tag or a customer's name / mobile / email
async function transactionSearchFilter(search) {
  if (!search) return undefined;
  const or = [{ idtag: search }];
  if (/^\d+$/.test(search)) or.push({ transactionId: Number(search) });

  const pattern = new RegExp(escapeRegex(search), "i");
  const users = await User.find({ $or: [{ username: pattern }, { mobile: pattern }, { email: pattern }] }, "_id")
    .limit(500)
    .lean();
  if (users.length) or.push({ user: { $in: users.map((user) => user._id) } });

  return { $or: or };
}

//! ---------- report data (shared by JSON endpoints and exports)

async function getChargingSummaryData(req, query) {
  const { range, scope, params } = await buildScope(req, query);
  const result = await aggregateOne(getChargingSummaryPipeline(params, query.groupBy));
  return {
    range,
    rows: (result.rows || []).map((g) => ({ ...groupLabel(query.groupBy, g._id, scope), ...formatUsage(g) })),
    totals: formatUsage(result.totals && result.totals[0]),
  };
}

async function getFinanceData(req, query) {
  const { range, scope, params } = await buildScope(req, query);
  const result = await aggregateOne(getFinancePipeline(params, query.groupBy));
  return {
    range,
    rows: (result.rows || []).map((g) => ({ ...groupLabel(query.groupBy, g._id, scope), ...formatFinance(g) })),
    totals: formatFinance(result.totals && result.totals[0]),
  };
}

async function transactionParams(req, query) {
  const { range, scope, params } = await buildScope(req, query);
  return {
    range,
    scope,
    params: {
      ...params,
      connectorId: query.connectorId,
      transactionMode: query.transactionMode,
      extra: await transactionSearchFilter(query.search),
    },
  };
}

//! ---------- JSON endpoints

exports.getOverview = async (req, res) => {
  const query = parseQuery(portalOverviewQuerySchema, req.query);
  const { range, scope, params } = await buildScope(req, query);

  // Same-length period immediately before, for comparison
  const previousParams = {
    ...params,
    fromDate: new Date(params.fromDate.getTime() - range.days * DAY_MS),
    toDate: params.fromDate,
  };
  const [current, previous] = await Promise.all([
    aggregateOne(getOverviewPipeline(params)),
    aggregateOne(getOverviewPipeline(previousParams)),
  ]);

  const totals = (current.totals && current.totals[0]) || {};
  const previousTotals = (previous.totals && previous.totals[0]) || {};

  const dailyByDay = new Map((current.daily || []).map((d) => [d._id, d]));
  const daily = Array.from({ length: range.days }, (_, i) => {
    const day = isoDay(range.startMs + i * DAY_MS);
    const d = dailyByDay.get(day) || {};
    return { date: day, sessions: d.sessions || 0, energyKwh: kwh(d.energyKwh), revenue: money(d.gross) };
  });

  const usageByCharger = new Map((current.byCharger || []).map((c) => [c._id, c]));
  const byCharger = [
    ...scope.chargers.map((charger) => ({
      cpid: charger.CPID,
      name: charger.name || "",
      ...formatUsage(usageByCharger.get(charger.CPID)),
    })),
    // Chargers that charged here in the period but have since been moved away
    ...(current.byCharger || [])
      .filter((c) => !scope.cpids.includes(c._id))
      .map((c) => ({ cpid: c._id, name: "", movedAway: true, ...formatUsage(c) })),
  ];

  res.status(200).json({
    success: true,
    data: {
      period: { startDate: query.startDate, endDate: query.endDate, days: range.days },
      kpis: {
        ...formatUsage(totals),
        energyCharges: money(totals.energyCharges),
        taxAmount: money(totals.taxAmount),
        serviceFees: money(totals.serviceFees),
      },
      previous: formatUsage(previousTotals),
      daily,
      byCharger,
      byMode: (current.byMode || []).map((m) => ({
        transactionMode: m._id || "unknown",
        sessions: m.sessions,
        revenue: money(m.gross),
      })),
    },
  });
};

exports.getChargingSummary = async (req, res) => {
  const query = parseQuery(portalChargingSummaryQuerySchema, req.query);
  const { rows, totals } = await getChargingSummaryData(req, query);
  res.status(200).json({ success: true, data: { groupBy: query.groupBy, rows, totals } });
};

exports.getFinance = async (req, res) => {
  const query = parseQuery(portalFinanceQuerySchema, req.query);
  const { rows, totals } = await getFinanceData(req, query);
  res.status(200).json({ success: true, data: { groupBy: query.groupBy, rows, totals } });
};

exports.getTransactions = async (req, res) => {
  const query = parseQuery(portalTransactionsQuerySchema, req.query);
  const { scope, params } = await transactionParams(req, query);

  const result = await aggregateOne(
    getTransactionsPipeline(params, {
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      skip: (query.page - 1) * query.limit,
      limit: query.limit,
    })
  );

  const totalRows = (result.totalCount && result.totalCount[0] && result.totalCount[0].count) || 0;
  const totals = (result.totals && result.totals[0]) || {};

  res.status(200).json({
    success: true,
    data: {
      rows: (result.rows || []).map((row) => formatTransaction(row, scope)),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalRows,
        totalPages: Math.ceil(totalRows / query.limit),
      },
      totals: {
        sessions: totals.sessions || 0,
        energyKwh: kwh(totals.energyKwh),
        totalAmount: money(totals.gross),
        taxAmount: money(totals.taxAmount),
        serviceFees: money(totals.serviceFees),
        avgDurationSeconds: totals.sessions ? whole(totals.durationSeconds / totals.sessions) : 0,
      },
    },
  });
};

//! ---------- exports

const GROUP_HEADER = { day: "Date", month: "Month", charger: "Charger", connector: "Charger / Connector" };
const MONEY = "#,##0.00";
const KWH = "#,##0.000";

const summaryColumns = (groupBy) => [
  { header: GROUP_HEADER[groupBy], key: "label", width: groupBy === "connector" ? 36 : 22 },
  { header: "Sessions", key: "sessions", width: 10 },
  { header: "Energy (kWh)", key: "energyKwh", numFmt: KWH },
  { header: "Revenue (NPR)", key: "revenue", numFmt: MONEY },
  { header: "Customers", key: "customers", width: 11 },
  { header: "Total duration", key: "duration", width: 14 },
  { header: "Avg duration", key: "avgDuration", width: 13 },
  { header: "Avg energy/session (kWh)", key: "avgEnergyKwh", width: 22, numFmt: KWH },
];

const financeColumns = (groupBy) => [
  { header: GROUP_HEADER[groupBy], key: "label", width: 22 },
  { header: "Sessions", key: "sessions", width: 10 },
  { header: "Energy delivered (kWh)", key: "energyKwh", width: 20, numFmt: KWH },
  { header: "Energy billed (kWh)", key: "billedKwh", width: 18, numFmt: KWH },
  { header: "Energy not billed (kWh)", key: "unbilledKwh", width: 21, numFmt: KWH },
  { header: "Energy charges excl. tax (NPR)", key: "energyCharges", width: 26, numFmt: MONEY },
  { header: "Tax (NPR)", key: "taxAmount", numFmt: MONEY },
  { header: "Service fees (NPR)", key: "serviceFees", width: 18, numFmt: MONEY },
  { header: "Gross collected (NPR)", key: "gross", width: 20, numFmt: MONEY },
  { header: "Wallet deducted (NPR)", key: "walletDeducted", width: 20, numFmt: MONEY },
  { header: "Difference (NPR)", key: "difference", width: 16, numFmt: MONEY },
  { header: "Mobile sessions", key: "mobileSessions", width: 15 },
  { header: "Mobile gross (NPR)", key: "mobileGross", width: 18, numFmt: MONEY },
  { header: "RFID sessions", key: "rfidSessions", width: 13 },
  { header: "RFID gross (NPR)", key: "rfidGross", width: 16, numFmt: MONEY },
];

const transactionColumns = [
  { header: "Session ID", key: "transactionId", width: 12 },
  { header: "Start (NPT)", key: "start", width: 17 },
  { header: "End (NPT)", key: "end", width: 17 },
  { header: "Charger", key: "chargerName", width: 18 },
  { header: "CPID", key: "cpid", width: 16 },
  { header: "Connector", key: "connectorId", width: 10 },
  { header: "Mode", key: "transactionMode", width: 9 },
  { header: "Customer", key: "customerName", width: 20 },
  { header: "Mobile", key: "customerMobile", width: 14 },
  { header: "Email", key: "customerEmail", width: 24 },
  { header: "RFID tag", key: "rfidTag", width: 14 },
  { header: "Duration", key: "duration", width: 10 },
  { header: "Energy (kWh)", key: "energyKwh", numFmt: KWH },
  { header: "Energy not billed (kWh)", key: "unbilledKwh", width: 21, numFmt: KWH },
  { header: "Tariff incl. tax (NPR/kWh)", key: "tariffRate", width: 22, numFmt: MONEY },
  { header: "Tax %", key: "taxPercent", width: 8 },
  { header: "Energy charges excl. tax (NPR)", key: "energyCharges", width: 26, numFmt: MONEY },
  { header: "Tax (NPR)", key: "taxAmount", numFmt: MONEY },
  { header: "Service fee (NPR)", key: "serviceFee", width: 16, numFmt: MONEY },
  { header: "Total (NPR)", key: "totalAmount", numFmt: MONEY },
  { header: "Wallet deducted (NPR)", key: "walletDeducted", width: 20, numFmt: MONEY },
  { header: "Stop reason", key: "stopReason", width: 18 },
  { header: "Closed by", key: "closedBy", width: 12 },
];

const flattenTransaction = (t) => ({
  ...t,
  start: nepalDateTime(t.startTime),
  end: nepalDateTime(t.endTime),
  chargerName: t.charger.name,
  cpid: t.charger.cpid,
  customerName: t.customer.name,
  customerMobile: t.customer.mobile,
  customerEmail: t.customer.email,
});

const withDurations = (r) => ({
  ...r,
  duration: formatDuration(r.durationSeconds),
  avgDuration: formatDuration(r.avgDurationSeconds),
});

const EXPORT_TYPES = {
  "charging-summary": {
    title: "Charging Summary",
    schema: portalChargingSummaryQuerySchema,
    build: async (req, query) => {
      const { rows, totals } = await getChargingSummaryData(req, query);
      return {
        columns: summaryColumns(query.groupBy),
        rows: rows.map(withDurations),
        totals: withDurations({ ...totals, label: "Total" }),
        extraMeta: [["Grouped by", query.groupBy]],
      };
    },
  },
  finance: {
    title: "Finance Report",
    schema: portalFinanceQuerySchema,
    build: async (req, query) => {
      const { rows, totals } = await getFinanceData(req, query);
      return {
        columns: financeColumns(query.groupBy),
        rows,
        totals: { ...totals, label: "Total" },
        extraMeta: [
          ["Grouped by", query.groupBy],
          ["Note", "Gross = amount deducted from customer wallets for charging at this station. Tax applies to energy only."],
        ],
      };
    },
  },
  transactions: {
    title: "Transactions",
    schema: portalTransactionsQuerySchema,
    build: async (req, query) => {
      const { scope, params } = await transactionParams(req, query);
      const [{ count = 0 } = {}] = await OcppTransactionView.aggregate([
        getTransactionRowsPipeline(params, query)[0],
        { $count: "count" },
      ]);
      if (count > MAX_EXPORT_ROWS) {
        throw createError(400, `Too many sessions to export (${count}). Please choose a shorter date range.`);
      }

      const cursor = OcppTransactionView.aggregate(getTransactionRowsPipeline(params, query))
        .allowDiskUse(true)
        .cursor({ batchSize: 500 });
      async function* rows() {
        for await (const row of cursor) yield flattenTransaction(formatTransaction(row, scope));
      }
      return { columns: transactionColumns, rows: rows(), extraMeta: [["Sessions", count]] };
    },
  },
};

exports.exportReport = async (req, res) => {
  const type = EXPORT_TYPES[req.params.type];
  if (!type) throw createError(404, "Unknown report");

  const query = parseQuery(withPortalExportFormat(type.schema), req.query);
  const station = await ChargingStation.findById(req.stationId, "name");
  // Built fully before any bytes are written, so validation errors still return JSON
  const report = await type.build(req, query);

  await logPortalEvent(req, "report_exported", {
    user: req.stationUser,
    meta: {
      type: req.params.type,
      format: query.format,
      startDate: query.startDate,
      endDate: query.endDate,
      cpid: query.cpid,
      groupBy: query.groupBy,
    },
  });

  const stationName = station?.name || "Station";
  await sendReportFile(res, {
    format: query.format,
    fileName: `${stationName}_${req.params.type}_${query.startDate}_to_${query.endDate}`,
    title: type.title,
    meta: [
      ["Station", stationName],
      ["Period", `${query.startDate} to ${query.endDate} (Nepal time)`],
      ...(query.cpid ? [["Charger", query.cpid]] : []),
      ...report.extraMeta,
      ["Generated", `${nepalDateTime(new Date())} NPT`],
    ],
    columns: report.columns,
    rows: report.rows,
    totals: report.totals,
  });
};
