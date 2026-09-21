const moment = require("moment");
const Rfid = require("../../models/rfidTagSchema");
const { getRfidsPipeline } = require("./pipes");
const mongoose = require("mongoose");
const createError = require("http-errors");

// Admin date picker sends YYYY-MM-DD; some clients still send DD-MM-YYYY
const parseExpiryDate = (expiry) => {
  if (!expiry) return expiry;
  const parsed = moment(
    expiry,
    ["YYYY-MM-DD", "DD-MM-YYYY", moment.ISO_8601],
    true
  );
  if (!parsed.isValid()) {
    throw new createError(400, `Invalid expiry date: ${expiry}`);
  }
  return parsed.toDate();
};

const createRfid = async (req, res) => {
  let data = req.body;
  data.expiry = parseExpiryDate(data.expiry);
  data.status = data.status === "active" ? "unassigned" : "inactive";
  const rfid = new Rfid(data);
  const savedRfid = await rfid.save();
  res.status(201).json({ status: true, message: "OK", result: savedRfid });
};

const createManyRfid = async (req, res) => {
  const data = req.body;
  await Rfid.insertMany(data.data);
  res.status(201).json({ status: true, message: "OK" });
};

const getRfids = async (req, res) => {
  const { pageNo } = req.query;

  const pipeline = await Rfid.aggregate(getRfidsPipeline())
    .skip(10 * (pageNo - 1))
    .limit(10);

  let totalCount = await Rfid.countDocuments();

  let result = pipeline.map((data) => ({
    _id: data._id,
    serialNumber: data.serialNumber,
    status: data.status,
    rfidTag: data.rfidTag,
    expiry: moment(data.expiry).format("DD-MM-YYYY"),
    createdAt: moment(data.createdAt).format("DD-MM-YYYY"),
    username: data.username,
    balance: data.balance?.toFixed(2),
  }));

  res
    .status(200)
    .json({ status: true, message: "OK", result: result, totalCount });
};

const getUnassignedRfids = async (req, res) => {
  const rfid = await Rfid.find({ status: { $in: ["unassigned", "active"] } });

  res.status(200).json({ status: true, message: "OK", result: rfid });
};

// get rfid by id
const getRfid = async (req, res, internalCall = false) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const rfid = await Rfid.findById(id);
  if (!rfid) {
    throw new createError(400, `Rfid with id ${id} not found`);
  }
  if (internalCall === true) return rfid;
  res.status(200).json({ status: true, message: "OK", result: rfid });
};

// get rfid by id
const getRfidBySerialNumber = async (req, res, internalCall = false) => {
  const serialNo = req.params.rfidSerialNumber;

  if (!serialNo) {
    throw new createError(400, `serialNo is empty`);
  }

  const rfid = await Rfid.findOne({ serialNumber: serialNo });
  if (!rfid) {
    throw new createError(400, `Rfid with serialNo ${serialNo} not found`);
  }
  if (internalCall === true) return rfid;
  res.status(200).send({ status: true, rfid: rfid });
};

// update rfid by id
const updateRfid = async (req, res, internalCall = false) => {
  const { id } = req.params;
  const data = req.body;
  if (data.expiry) {
    data.expiry = parseExpiryDate(data.expiry);
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const payload = { $set: data };

  const rfid = await Rfid.findByIdAndUpdate(id, payload, { new: true });
  if (!rfid) {
    throw new createError(404, `Rfid with id ${id} not found`);
  }
  if (internalCall === true) return rfid;
  res.status(200).json({ status: true, message: "OK", result: rfid });
};

// delete rfid by id
const deleteRfid = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  req.params.rfidTagId = id;
  const { removeRfidTagById } = require("../user/userRFIDController"); //!Lazy loading to avoid circular issue

  await removeRfidTagById(req, res, true);

  const rfid = await Rfid.findByIdAndDelete(id);
  if (!rfid) {
    throw new createError(404, `Rfid with id ${id} not found`);
  }
  res.status(200).json({ status: true, message: "Deleted !" });
};

module.exports = {
  createRfid,
  createManyRfid,
  getRfids,
  getRfid,
  updateRfid,
  deleteRfid,
  getRfidBySerialNumber,
  getUnassignedRfids,
};
