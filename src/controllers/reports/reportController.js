const mongoose = require("mongoose");
const moment = require("moment");
const createError = require("http-errors");
const Role = require("../../models/rolesSchema");
const OcppTransactionView = require("../../models/ocppTransactionView");
const { reportViewQuerySchema } = require("../../validation");
const { getChargingSessionReportPipeline } = require("./pipes");

const DATE_FORMAT = "YYYY-MM-DD";
const MAX_DATE_RANGE_DAYS = 92;

// Matches the download's own date/time formatting exactly: plain moment().format()
// with no timezone conversion (the download applies none either).
function formatDateTime(date) {
  return date ? moment(date).format("DD-MM-YYYY hh:mm A") : "";
}

function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return "00:00:00";
  }
  let seconds = Math.floor(totalSeconds);
  let minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  seconds = seconds % 60;
  minutes = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// A role's location_access can be the literal ['all'] sentinel (seeded for the
// superadmin role) instead of a list of ChargingStation ids. Returns:
// - null: no location restriction (full access)
// - []: role has no accessible locations at all
// - [ObjectId, ...]: restrict to these locations
async function resolveLocationIds(roleId, location) {
  const role = await Role.findById(roleId, "location_access");
  const rawLocationAccess = (role && role.location_access) || [];
  const hasFullAccess = rawLocationAccess.includes("all");

  if (location) {
    if (!mongoose.Types.ObjectId.isValid(location)) {
      throw new createError(400, 'Invalid "location" id');
    }
    const requestedId = new mongoose.Types.ObjectId(location);

    if (!hasFullAccess) {
      const isAllowed = rawLocationAccess.some(
        (id) => mongoose.Types.ObjectId.isValid(id) && String(id) === String(requestedId)
      );
      if (!isAllowed) {
        throw new createError(403, "You do not have access to this location");
      }
    }
    return [requestedId];
  }

  if (hasFullAccess) return null;

  return rawLocationAccess
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

function emptyReportResult(page, limit) {
  return {
    rows: [],
    pagination: { page, limit, totalRows: 0, totalPages: 0 },
    summary: {
      totalSessions: 0,
      totalKwh: 0,
      totalAmount: 0,
      totalTax: 0,
      avgSessionDuration: "00:00:00",
    },
  };
}

async function buildChargingSessionsReport({
  fromDate,
  toDate,
  locationIds,
  page,
  limit,
  sortBy,
  sortOrder,
}) {
  const skip = (page - 1) * limit;

  const pipeline = getChargingSessionReportPipeline({
    fromDate,
    toDate,
    locationIds,
    sortBy,
    sortOrder,
    skip,
    limit,
  });

  const [facetResult] = await OcppTransactionView.aggregate(pipeline, {
    allowDiskUse: true,
  });

  const rawRows = (facetResult && facetResult.rows) || [];
  const summaryDoc = facetResult && facetResult.summary && facetResult.summary[0];
  const totalRows = (facetResult && facetResult.totalCount && facetResult.totalCount[0] && facetResult.totalCount[0].count) || 0;

  const rows = rawRows.map((row) => ({
    transactionId: row.transactionId,
    transactionDate: formatDateTime(row.endTime),
    name: row.username,
    transactionMode: row.transactionMode,
    station: row.stationName,
    state: row.stationState,
    chargePoint: row.cpid,
    connectorId: row.connectorId,
    ocppStartTime: formatDateTime(row.startTime),
    ocppStopTime: formatDateTime(row.endTime),
    sessionDuration: formatDuration(row.durationSeconds),
    meterStart: row.meterStart,
    meterStop: row.meterStop,
    unitsConsumed: Number(row.unitsConsumed.toFixed(3)),
    tariffRate: Number(row.tariffRate.toFixed(2)),
    taxPercentage: row.taxPercentage,
    taxAmount: Number(row.taxAmount.toFixed(2)),
    totalAmount: Number(row.totalAmount.toFixed(2)),
    stopReason: row.closureReason,
    closedBy: row.closeBy,
  }));

  const summary = {
    totalSessions: (summaryDoc && summaryDoc.totalSessions) || 0,
    totalKwh: Number(((summaryDoc && summaryDoc.totalKwh) || 0).toFixed(3)),
    totalAmount: Number(((summaryDoc && summaryDoc.totalAmount) || 0).toFixed(2)),
    totalTax: Number(((summaryDoc && summaryDoc.totalTax) || 0).toFixed(2)),
    avgSessionDuration: formatDuration(summaryDoc && summaryDoc.avgDurationSeconds),
  };

  return {
    rows,
    pagination: {
      page,
      limit,
      totalRows,
      totalPages: Math.ceil(totalRows / limit) || 0,
    },
    summary,
  };
}

const REPORT_TYPE_HANDLERS = {
  "charging-sessions": buildChargingSessionsReport,
};

exports.getReportView = async (req, res) => {
  const { error, value } = reportViewQuerySchema.validate(req.query);
  if (error) {
    throw new createError(400, error.details.map((detail) => detail.message).join(", "));
  }

  const { reportType, startDate, endDate, location, page, limit, sortBy, sortOrder } = value;

  const handler = REPORT_TYPE_HANDLERS[reportType];
  if (!handler) {
    throw new createError(400, `Unsupported reportType "${reportType}"`);
  }

  const fromDate = moment(startDate, DATE_FORMAT).startOf("day").toDate();
  const toDate = moment(endDate, DATE_FORMAT).add(1, "day").startOf("day").toDate();

  if (toDate <= fromDate) {
    throw new createError(400, '"endDate" must not be before "startDate"');
  }

  if (moment(toDate).diff(moment(fromDate), "days") > MAX_DATE_RANGE_DAYS) {
    throw new createError(400, `Date range cannot exceed ${MAX_DATE_RANGE_DAYS} days`);
  }

  const locationIds = await resolveLocationIds(req.role._id, location);

  const result =
    locationIds && locationIds.length === 0
      ? emptyReportResult(page, limit)
      : await handler({ fromDate, toDate, locationIds, page, limit, sortBy, sortOrder });

  res.status(200).json({ status: true, message: "OK", result });
};
