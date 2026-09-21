// Column keys, in the exact order the CMS download (NEW_OCPP_SERVER's
// GET /ocpp/dashboard/transaction/report) presents them. Every field here is ported
// from that endpoint's aggregation + formatting so the numbers match.
const REPORT_SORT_FIELDS = {
  transactionId: "transactionId",
  transactionDate: "endTime",
  name: "username",
  transactionMode: "transactionMode",
  station: "stationName",
  state: "stationState",
  chargePoint: "cpid",
  connectorId: "connectorId",
  ocppStartTime: "startTime",
  ocppStopTime: "endTime",
  sessionDuration: "durationSeconds",
  meterStart: "meterStart",
  meterStop: "meterStop",
  unitsConsumed: "unitsConsumed",
  tariffRate: "tariffRate",
  taxPercentage: "taxPercentage",
  taxAmount: "taxAmount",
  totalAmount: "totalAmount",
  stopReason: "closureReason",
  closedBy: "closeBy",
};

const DEFAULT_SORT_BY = "transactionDate";

// locationIds: array of ObjectId to restrict to, or null for no location restriction
// (role has full ("all") location access and no specific location was requested).
const getChargingSessionReportPipeline = ({
  fromDate,
  toDate,
  locationIds,
  sortBy,
  sortOrder,
  skip,
  limit,
}) => {
  const sortField = REPORT_SORT_FIELDS[sortBy] || REPORT_SORT_FIELDS[DEFAULT_SORT_BY];

  const pipeline = [
    {
      $match: {
        transaction_status: "Completed",
        startTime: { $gte: fromDate, $lt: toDate },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        pipeline: [{ $project: { username: 1 } }],
        as: "userDetails",
      },
    },
    {
      $lookup: {
        from: "evmachines",
        localField: "cpid",
        foreignField: "CPID",
        pipeline: [
          {
            $lookup: {
              from: "chargingstations",
              localField: "location_name",
              foreignField: "_id",
              as: "stationDetails",
            },
          },
          {
            $unwind: {
              path: "$stationDetails",
              preserveNullAndEmptyArrays: true,
            },
          },
        ],
        as: "evMachineDetails",
      },
    },
    {
      $unwind: {
        path: "$evMachineDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
  ];

  if (locationIds) {
    pipeline.push({
      $match: { "evMachineDetails.stationDetails._id": { $in: locationIds } },
    });
  }

  pipeline.push(
    {
      $project: {
        transactionId: 1,
        username: { $ifNull: [{ $arrayElemAt: ["$userDetails.username", 0] }, ""] },
        transactionMode: { $ifNull: ["$transactionMode", ""] },
        stationName: { $ifNull: ["$evMachineDetails.stationDetails.name", ""] },
        stationState: { $ifNull: ["$evMachineDetails.stationDetails.state", ""] },
        cpid: 1,
        connectorId: 1,
        startTime: 1,
        endTime: 1,
        durationSeconds: {
          $cond: [
            { $and: [{ $ifNull: ["$endTime", false] }, { $ifNull: ["$startTime", false] }] },
            { $divide: [{ $subtract: ["$endTime", "$startTime"] }, 1000] },
            null,
          ],
        },
        meterStart: { $ifNull: ["$meterStart", 0] },
        meterStop: { $ifNull: ["$meterStop", 0] },
        unitsConsumed: {
          $divide: [
            { $subtract: [{ $ifNull: ["$meterStop", 0] }, { $ifNull: ["$meterStart", 0] }] },
            1000,
          ],
        },
        tariffRate: { $ifNull: ["$chargingTariff", 0] },
        taxFraction: { $ifNull: [{ $toDouble: "$tax" }, 0] },
        totalAmount: { $ifNull: ["$totalAmount", 0] },
        closureReason: { $ifNull: ["$closureReason", ""] },
        closeBy: { $ifNull: ["$closeBy", ""] },
      },
    },
    {
      $addFields: {
        taxPercentage: { $multiply: ["$taxFraction", 100] },
        taxAmount: {
          $subtract: [
            "$totalAmount",
            { $divide: ["$totalAmount", { $add: [1, "$taxFraction"] }] },
          ],
        },
      },
    },
    { $project: { taxFraction: 0 } },
    { $sort: { [sortField]: sortOrder === "asc" ? 1 : -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        summary: [
          {
            $group: {
              _id: null,
              totalSessions: { $sum: 1 },
              totalKwh: { $sum: "$unitsConsumed" },
              totalAmount: { $sum: "$totalAmount" },
              totalTax: { $sum: "$taxAmount" },
              avgDurationSeconds: { $avg: "$durationSeconds" },
            },
          },
        ],
        totalCount: [{ $count: "count" }],
      },
    }
  );

  return pipeline;
};

module.exports = {
  getChargingSessionReportPipeline,
  REPORT_SORT_FIELDS,
  DEFAULT_SORT_BY,
};
