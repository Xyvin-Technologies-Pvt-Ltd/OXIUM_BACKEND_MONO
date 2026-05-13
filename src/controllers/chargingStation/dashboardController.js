const AWS = require("aws-sdk");
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const moment = require("moment");

const s3 = new AWS.S3();

const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const ChargingStation = require("../../models/chargingStationSchema");
const {
  getChargingStationEvMachineListPipeline,
  getChargingStationByIdForDashboardPipeline,
  getCPIDListByChargingStationPipeline,
} = require("./pipes");

// Generate a unique identifier (UUID)
const uniqueId = uuidv4();

exports.getChargingStationListForDashboard = async (req, res) => {
  const location_access = req.roleDoc?.location_access;
  const { parsePagination } = require("../../utils/parsePagination");
  const { escapeRegex } = require("../../utils/escapeRegex");

  const { searchQuery } = req.query;

  const filter = {};

  const { skip, limit } = parsePagination(req.query, { pageSize: 10 });

  if (searchQuery) {
    const safe = escapeRegex(searchQuery);
    filter.$or = [
      { name: { $regex: safe, $options: "i" } },
      { address: { $regex: safe, $options: "i" } },
      { country: { $regex: safe, $options: "i" } },
      { state: { $regex: safe, $options: "i" } },
      { owner: { $regex: safe, $options: "i" } },
    ];
  }

  if (location_access != null && location_access.length > 0) {
    filter._id = { $in: location_access };
  }

  let list = await ChargingStation.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  let totalCount = await ChargingStation.find(filter).countDocuments();
  res
    .status(200)
    .json({ status: true, message: "OK", result: list, totalCount });
};

exports.getChargingStationListForDropdown = async (req, res) => {
  const location_access = req.roleDoc?.location_access;

  const filter = {};

  if (location_access != null && location_access.length > 0) {
    filter._id = { $in: location_access };
  }

  let list = await ChargingStation.find(filter).sort({ updatedAt: -1 });
  let totalCount = await ChargingStation.find(filter).countDocuments();
  res
    .status(200)
    .json({ status: true, message: "OK", result: list, totalCount });
};

exports.getChargingStationEvMachineList = async (req, res) => {
  try {
    let list = await ChargingStation.aggregate(
      getChargingStationEvMachineListPipeline()
    );
    res.status(200).json({ status: true, message: "OK", result: list });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.getChargingStationByIdForDashboard = async (req, res) => {
  let id = req.params.chargingStationId;

  try {
    const doesExist = await ChargingStation.findOne({ _id: id });

    if (!doesExist) {
      return res.status(404).json({ error: "Charging Station not found" });
    }

    const pipedData = await ChargingStation.aggregate(
      getChargingStationByIdForDashboardPipeline(id)
    );
    const chargingStation = pipedData[0];

    // Analytics Count
    const transactions = chargingStation.transactionDetails;
    const totalCounts = transactions.length;
    const totalUnitsSum = transactions.reduce(
      (sum, transaction) =>
        sum + (transaction.meterStop - transaction.meterStart),
      0
    );
    const totalAmountsSum = transactions.reduce(
      (sum, transaction) => sum + transaction.totalAmount,
      0
    );

    const analytics = {
      totalCounts,
      totalUnitsSum,
      totalAmount: totalAmountsSum,
    };

    // Average rating
    const reviewDetails = chargingStation.reviewDetails;
    const totalRating = reviewDetails.reduce(
      (sum, review) => sum + review.rating,
      0
    );
    const count = reviewDetails.length;
    const averageRating = count > 0 ? totalRating / count : null;

    const result = {
      _id: chargingStation._id,
      name: chargingStation.name || "",
      address: chargingStation.address || "",
      latitude: chargingStation.latitude || null,
      longitude: chargingStation.longitude || null,
      owner: chargingStation.owner || "",
      owner_email: chargingStation.owner_email || "",
      owner_phone: chargingStation.owner_phone || "",
      location_support_name: chargingStation.location_support_name || "",
      location_support_email: chargingStation.location_support_email || "",
      location_support__phone: chargingStation.location_support__phone || "",
      tags: chargingStation.tags || [],
      status: chargingStation.status || "Offline",
      commissioned_on: chargingStation.commissioned_on || "",
      average_rating: averageRating || 1,
      reviews: chargingStation.reviewDetails || [],
      image: chargingStation.image || "",
      amenities: chargingStation.amenities || [],
      startTime:
        moment(chargingStation.startTime, "HH:mm").format("hh:mm A") || "",
      stopTime:
        moment(chargingStation.stopTime, "HH:mm").format("hh:mm A") || "",
      chargers: chargingStation.evMachines[0].evModelDetails[0]
        ? chargingStation.evMachines
        : [],
      total_revenue: analytics.totalAmount || 0,
      total_units: analytics.totalUnitsSum || 0,
      numTransactions: analytics.totalCounts || 0,
      published: chargingStation.published || true,
      vendor: chargingStation.vendor || "",
      category: chargingStation.category || "",
    };

    res.status(200).json({ status: true, message: "Ok", result });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.getCPIDListByChargingStationForDashboard = async (req, res) => {
  let id = req.params.chargingStationId;

  try {
    const list = await ChargingStation.aggregate(
      getCPIDListByChargingStationPipeline(id)
    );
    res.status(200).json({ status: true, message: "OK", result: list });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.imageUpload = async (req, res) => {
  const file = req.file;
  console.log(file);
  if (!file) return res.status(400).send("No file uploaded.");

  // Create a stream to S3
  const params = {
    Bucket: "image-upload-oxium/charging-station",
    Key: `${uniqueId}-${file.originalname}`,
    ContentType: file.mimetype,
    Body: file.buffer,
  };

  s3.upload(params, (err, data) => {
    if (err) {
      return res.status(500).send(err);
    }

    // Send back the URL of the uploaded file
    res.send({ status: true, message: "OK", url: data.Location });
  });
};
