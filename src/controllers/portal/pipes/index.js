// Aggregations over the OCPP server's "ocpptransactions" collection for the station
// portal. Every pipeline starts from sessionMatch(), which restricts to one station —
// callers must pass req.stationId and the cpids of that station's chargers only.
//
// Money per completed session (mirrors the OCPP server's billing, see
// NEW_OCPP_SERVER utils/normalizeTariff.js + applyServiceFee.js):
//   gross         = totalAmount (only ever increased after a successful wallet deduction)
//   serviceFee    = serviceAmount, but only when serviceFeeApplied (otherwise not in gross)
//   energyAmount  = gross - serviceFee            (energy billed, tax inclusive)
//   taxAmount     = energyAmount - energyAmount / (1 + taxRate)   (tax is on energy only)
//   energyCharges = energyAmount - taxAmount      (energy, tax exclusive)
// This is the same tax split the CMS charging report uses.

const REPORT_TIMEZONE = "Asia/Kathmandu";

const TRANSACTION_SORT_FIELDS = {
  startTime: "startTime",
  endTime: "endTime",
  transactionId: "transactionId",
  energyKwh: "energyKwh",
  durationSeconds: "durationSeconds",
  totalAmount: "gross",
};

// Sessions store the station they started at (stationId, set by the OCPP server).
// Older sessions without it are attributed through the charger's current station.
const sessionMatch = ({ stationId, cpids, fromDate, toDate, cpid, connectorId, transactionMode, extra }) => ({
  $match: {
    transaction_status: "Completed",
    startTime: { $gte: fromDate, $lt: toDate },
    ...(cpid && { cpid }),
    ...(connectorId !== undefined && { connectorId }),
    ...(transactionMode && { transactionMode }),
    // $and so the station $or and a search $or (extra) don't overwrite each other
    $and: [{ $or: [{ stationId }, { stationId: null, cpid: { $in: cpids } }] }, ...(extra ? [extra] : [])],
  },
});

const billingStages = () => [
  {
    $addFields: {
      _tax: { $convert: { input: "$tax", to: "double", onError: 0, onNull: 0 } },
      _meterStopWh: {
        $ifNull: [
          "$meterStop",
          {
            $cond: [
              { $ifNull: ["$lastMeterValue", false] },
              { $multiply: ["$lastMeterValue", 1000] },
              { $ifNull: ["$meterStart", 0] },
            ],
          },
        ],
      },
      gross: { $ifNull: ["$totalAmount", 0] },
      serviceFee: {
        $cond: [{ $eq: ["$serviceFeeApplied", true] }, { $ifNull: ["$serviceAmount", 0] }, 0],
      },
      tariffRate: { $ifNull: ["$chargingTariff", 0] },
      durationSeconds: {
        $cond: [
          { $and: [{ $ifNull: ["$endTime", false] }, { $ifNull: ["$startTime", false] }] },
          { $max: [0, { $divide: [{ $subtract: ["$endTime", "$startTime"] }, 1000] }] },
          0,
        ],
      },
      day: { $dateToString: { format: "%Y-%m-%d", date: "$startTime", timezone: REPORT_TIMEZONE } },
      month: { $dateToString: { format: "%Y-%m", date: "$startTime", timezone: REPORT_TIMEZONE } },
    },
  },
  {
    $addFields: {
      taxRate: { $cond: [{ $gt: ["$_tax", 1] }, { $divide: ["$_tax", 100] }, "$_tax"] },
      energyKwh: {
        $max: [0, { $divide: [{ $subtract: ["$_meterStopWh", { $ifNull: ["$meterStart", 0] }] }, 1000] }],
      },
      energyAmount: { $max: [0, { $subtract: ["$gross", "$serviceFee"] }] },
    },
  },
  {
    $addFields: {
      taxAmount: {
        $subtract: ["$energyAmount", { $divide: ["$energyAmount", { $add: [1, "$taxRate"] }] }],
      },
      billedKwh: {
        $cond: [{ $gt: ["$tariffRate", 0] }, { $divide: ["$energyAmount", "$tariffRate"] }, "$energyKwh"],
      },
    },
  },
  {
    $addFields: {
      energyCharges: { $subtract: ["$energyAmount", "$taxAmount"] },
      unbilledKwh: { $max: [0, { $subtract: ["$energyKwh", "$billedKwh"] }] },
    },
  },
  { $project: { _tax: 0, _meterStopWh: 0 } },
];

// One wallet transaction per session (type "charging deduction"), keyed by the session's
// transactionId as a string; the OCPP server $inc's its amount on every deduction.
const walletLookupStages = () => [
  { $addFields: { _txIdString: { $toString: "$transactionId" } } },
  {
    $lookup: {
      from: "wallettransactions",
      localField: "_txIdString",
      foreignField: "transactionId",
      pipeline: [{ $match: { type: "charging deduction" } }, { $project: { amount: 1 } }],
      as: "_wallet",
    },
  },
  { $addFields: { walletDeducted: { $sum: "$_wallet.amount" } } },
  { $project: { _txIdString: 0, _wallet: 0 } },
];

const modeSum = (mode, field) => ({
  $sum: { $cond: [{ $eq: ["$transactionMode", mode] }, `$${field}`, 0] },
});

const usageAccumulators = {
  sessions: { $sum: 1 },
  energyKwh: { $sum: "$energyKwh" },
  durationSeconds: { $sum: "$durationSeconds" },
  gross: { $sum: "$gross" },
  customers: { $addToSet: "$user" },
};

const financeAccumulators = {
  sessions: { $sum: 1 },
  energyKwh: { $sum: "$energyKwh" },
  billedKwh: { $sum: "$billedKwh" },
  unbilledKwh: { $sum: "$unbilledKwh" },
  energyCharges: { $sum: "$energyCharges" },
  taxAmount: { $sum: "$taxAmount" },
  serviceFees: { $sum: "$serviceFee" },
  gross: { $sum: "$gross" },
  walletDeducted: { $sum: "$walletDeducted" },
  mobileSessions: { $sum: { $cond: [{ $eq: ["$transactionMode", "mobile"] }, 1, 0] } },
  mobileGross: modeSum("mobile", "gross"),
  rfidSessions: { $sum: { $cond: [{ $eq: ["$transactionMode", "rfid"] }, 1, 0] } },
  rfidGross: modeSum("rfid", "gross"),
};

const GROUP_KEYS = {
  day: "$day",
  month: "$month",
  charger: "$cpid",
  connector: { cpid: "$cpid", connectorId: "$connectorId" },
};

const GROUP_SORT = {
  day: { _id: 1 },
  month: { _id: 1 },
  charger: { _id: 1 },
  connector: { "_id.cpid": 1, "_id.connectorId": 1 },
};

const getOverviewPipeline = (params) => [
  sessionMatch(params),
  ...billingStages(),
  {
    $facet: {
      totals: [
        {
          $group: {
            _id: null,
            ...usageAccumulators,
            taxAmount: { $sum: "$taxAmount" },
            serviceFees: { $sum: "$serviceFee" },
            energyCharges: { $sum: "$energyCharges" },
          },
        },
      ],
      daily: [
        { $group: { _id: "$day", sessions: { $sum: 1 }, energyKwh: { $sum: "$energyKwh" }, gross: { $sum: "$gross" } } },
        { $sort: { _id: 1 } },
      ],
      byCharger: [
        { $group: { _id: "$cpid", ...usageAccumulators } },
        { $sort: { gross: -1 } },
      ],
      byMode: [{ $group: { _id: "$transactionMode", sessions: { $sum: 1 }, gross: { $sum: "$gross" } } }],
    },
  },
];

const getGroupedPipeline = (params, { groupBy, accumulators, withWallet }) => [
  sessionMatch(params),
  ...billingStages(),
  ...(withWallet ? walletLookupStages() : []),
  {
    $facet: {
      rows: [{ $group: { _id: GROUP_KEYS[groupBy], ...accumulators } }, { $sort: GROUP_SORT[groupBy] }],
      totals: [{ $group: { _id: null, ...accumulators } }],
    },
  },
];

const getChargingSummaryPipeline = (params, groupBy) =>
  getGroupedPipeline(params, { groupBy, accumulators: usageAccumulators, withWallet: false });

const getFinancePipeline = (params, groupBy) =>
  getGroupedPipeline(params, { groupBy, accumulators: financeAccumulators, withWallet: true });

const transactionSortStage = ({ sortBy, sortOrder }) => ({
  $sort: { [TRANSACTION_SORT_FIELDS[sortBy]]: sortOrder === "asc" ? 1 : -1, transactionId: -1 },
});

const transactionDetailStages = () => [
  {
    $lookup: {
      from: "users",
      localField: "user",
      foreignField: "_id",
      pipeline: [{ $project: { username: 1, mobile: 1, email: 1 } }],
      as: "_user",
    },
  },
  ...walletLookupStages(),
];

// Unpaginated rows for exports. No $facet, so it can be streamed with a cursor without
// hitting the 16MB single-document limit.
const getTransactionRowsPipeline = (params, sort) => [
  sessionMatch(params),
  ...billingStages(),
  transactionSortStage(sort),
  ...transactionDetailStages(),
];

const getTransactionsPipeline = (params, { sortBy, sortOrder, skip, limit }) => {
  const rowStages = [
    transactionSortStage({ sortBy, sortOrder }),
    { $skip: skip },
    { $limit: limit },
    ...transactionDetailStages(),
  ];

  return [
    sessionMatch(params),
    ...billingStages(),
    {
      $facet: {
        rows: rowStages,
        totalCount: [{ $count: "count" }],
        totals: [
          {
            $group: {
              _id: null,
              sessions: { $sum: 1 },
              energyKwh: { $sum: "$energyKwh" },
              gross: { $sum: "$gross" },
              taxAmount: { $sum: "$taxAmount" },
              serviceFees: { $sum: "$serviceFee" },
              durationSeconds: { $sum: "$durationSeconds" },
            },
          },
        ],
      },
    },
  ];
};

module.exports = {
  REPORT_TIMEZONE,
  TRANSACTION_SORT_FIELDS,
  getOverviewPipeline,
  getChargingSummaryPipeline,
  getFinancePipeline,
  getTransactionsPipeline,
  getTransactionRowsPipeline,
};
