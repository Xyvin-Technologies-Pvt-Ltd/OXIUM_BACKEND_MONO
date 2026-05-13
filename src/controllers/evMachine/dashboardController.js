const mongoose = require("mongoose");
const moment = require("moment");
const EvMachine = require("../../models/evMachineSchema");
const {
  getDashboardListPipeline,
  getTariffPipeline,
  getDashboardListByIdPipeline,
  getReport2Pipeline,
  getReportPipeline,
} = require("./pipes");

exports.getDashboardList = async (req, res) => {
  const { parsePagination } = require("../../utils/parsePagination");
  const { escapeRegex } = require("../../utils/escapeRegex");

  const location_access = req.roleDoc?.location_access;
  const locations =
    location_access && location_access.length > 0
      ? location_access.map((id) => new mongoose.Types.ObjectId(id))
      : [];

  const { searchQuery } = req.query;
  const { skip, limit } = parsePagination(req.query, { pageSize: 10 });

  const filter = {};

  if (searchQuery) {
    const safe = escapeRegex(searchQuery);
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { CPID: { $regex: safe, $options: "i" } },
      { cpidStatus: { $regex: safe, $options: "i" } },
      { authorization_key: { $regex: safe, $options: "i" } },
      { "chargingStationDetails.name": { $regex: safe, $options: "i" } },
      { "evModelDetails.oem": { $regex: safe, $options: "i" } },
    ];
  }

  try {
    const pipeline = getDashboardListPipeline(filter, locations);
    const pipedData = await EvMachine.aggregate([...pipeline])
      .skip(skip)
      .limit(limit);

    const countPipeline = [...pipeline, { $count: "totalCount" }];

    const countResult = await EvMachine.aggregate(countPipeline);
    const totalCount = countResult.length > 0 ? countResult[0].totalCount : 0;

    res.send({ status: true, message: "OK", result: pipedData, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.getTariff = async (req, res) => {
  try {
    const pipedData = await EvMachine.aggregate(
      getTariffPipeline(req.params.cpid)
    );
    res.send({ status: true, message: "OK", result: pipedData });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.ChangeTariff = async (req, res) => {
  let chargingTariff = req.body.chargingTariff;
  let cpid = req.params.cpid;
  let updateData = chargingTariff
    ? { $set: { chargingTariff: chargingTariff } }
    : { $unset: { chargingTariff: 1 } };

  await EvMachine.findByIdAndUpdate(cpid, updateData);

  res.send({ status: true, message: "Updated!!" });
};

exports.getDashboardListById = async (req, res) => {
  const id = req.params.id;

  try {
    const pipedData = await EvMachine.aggregate(
      getDashboardListByIdPipeline(id)
    );
    const result = pipedData[0];

    res.send({ status: true, message: "OK", result });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.getReport2 = async (req, res) => {
  let { startDate, endDate } = req.query;
  let filters = {};

  if (startDate && endDate) {
    if (
      /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(endDate)
    ) {
      let fromDate = moment(startDate, "YYYY-MM-DD").toDate();
      let toDate = moment(endDate, "YYYY-MM-DD").toDate();
      toDate.setDate(toDate.getDate() + 1);
      filters.createdAt = { $gte: fromDate, $lt: toDate };
    } else {
      return res.status(400).json({
        status: false,
        message: 'Date should be in "YYYY-MM-DD" Format',
      });
    }
  }

  try {
    let result = await EvMachine.aggregate(getReport2Pipeline(filters));

    if (!result.length)
      return res.status(400).json({ status: false, message: "No Data Found" });

    result = result.map((transaction) => {
      let chargingTariffRate = "";
      if (transaction) {
        let totalAmount =
          Number(transaction.chargingTariffDetails.serviceAmount) +
          Number(transaction.chargingTariffDetails.value);
        chargingTariffRate +=
          totalAmount + totalAmount * (transaction.tax_percentage / 100);
      }

      return {
        ...transaction,
        createdAt: moment(transaction.createdAt).format("DD-MM-YYYY HH:mm:ss"),
        connectorType: transaction.chargerTypes
          ? transaction.chargerTypes.join(", ")
          : "",
        chargingTariffRate: chargingTariffRate,
      };
    });

    const headers = [
      { header: "Location Name", key: "chargingStation" },
      { header: "Charge Point Id", key: "CPID" },
      { header: "State", key: "state" },
      { header: "Model Name", key: "model" },
      { header: "OEM Name", key: "oem" },
      { header: "Connector Standard(AC/DC)", key: "connectorStandard" },
      { header: "Type of Connector", key: "connectorType" },
      { header: "Power", key: "capacity" },
      { header: "Created On", key: "createdAt" },
      { header: "Commissioned On", key: "commissioned_date" },
      { header: "Charging Tariff Name", key: "chargingTariff" },
      { header: "Charging Tariff Type", key: "chargingTariffType" },
      {
        header: "Charging Tariff Rate( / kWh, / min)",
        key: "chargingTariffRate",
      },
      { header: "Charging Tariff Tax", key: "tax_percentage" },
      { header: "Chargepoint Latitude", key: "latitude" },
      { header: "Chargepoint Longitude", key: "longitude" },
    ];

    res.status(200).json({
      status: true,
      message: "OK",
      result: { headers: headers, body: result },
    });
  } catch (error) {
    res.status(400).json({ status: false, message: "Internal Server Error" });
  }
};

exports.getReport = async (req, res) => {
  const { startDate, endDate, location } = req.body;

  try {
    const pipedData = await EvMachine.aggregate(
      getReportPipeline(startDate, endDate, location)
    );
    res.status(200).json({ status: true, message: "OK", result: pipedData });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};
