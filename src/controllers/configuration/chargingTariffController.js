const mongoose = require("mongoose");
const createError = require("http-errors");
const ChargingTariff = require("../../models/chargingTariffSchema");
const {
  chargingTariffValidationSchema,
  chargingTariffDefaultUpdateValidationSchema,
  chargingTariffDefaultValidationSchema,
  chargingTariffUpdateValidationSchema,
} = require("../../validation");
const { getTaxPercentage } = require("./taxController");
const { getChargingTariffListPipeline } = require("./pipes");

// create chargingTariff
exports.createChargingTariff = async (req, res) => {
  const { error, value } = chargingTariffValidationSchema.validate(req.body);

  if (error) {
    throw new createError(
      400,
      error.details.map((detail) => detail.message).join(", ")
    );
  }

  const chargingTariff = new ChargingTariff(value);
  const savedChargingTariff = await chargingTariff.save();
  res.status(201).json(savedChargingTariff);
};

// default chargingTariff - create/edit
exports.createDefaultChargingTariff = async (req, res) => {
  let defaultChargingTariff = await ChargingTariff.findOne(
    { isDefault: true },
    "_id"
  );

  if (defaultChargingTariff) {
    const { error, value } =
      chargingTariffDefaultUpdateValidationSchema.validate(req.body);

    if (error) {
      throw new createError(
        400,
        error.details.map((detail) => detail.message).join(", ")
      );
    }

    const chargingTariff = await ChargingTariff.findByIdAndUpdate(
      defaultChargingTariff._id,
      { $set: req.body },
      { new: true }
    );
    res.status(200).json(chargingTariff);
  } else {
    const { error, value } = chargingTariffDefaultValidationSchema.validate(
      req.body
    );

    if (error) {
      throw new createError(
        400,
        error.details.map((detail) => detail.message).join(", ")
      );
    }

    const chargingTariff = new ChargingTariff({
      ...value,
      name: "Default",
      isDefault: true,
    });
    const savedChargingTariff = await chargingTariff.save();
    res.status(201).json(savedChargingTariff);
  }
};

//get  Default Charging tariff

exports.getDefaultChargingTariff = async (req, res, internalCall = false) => {
  let result = await ChargingTariff.findOne({ name: "Default" });
    if (internalCall === true) return result;
  res.status(200).json({ status: true, result });
};

// get all chargingTariff with
exports.getChargingTariffList = async (req, res) => {
  const { pageNo, searchQuery } = req.query;

  const filter = {};

  if (searchQuery) {
    filter.$or = [
      { name: { $regex: searchQuery, $options: "i" } },
      { tariffType: { $regex: searchQuery, $options: "i" } },
      { "taxData.name": { $regex: searchQuery, $options: "i" } },
    ];
  }

  try {
    const pipeline = getChargingTariffListPipeline(filter);
    const result = await ChargingTariff.aggregate(pipeline)
      .skip(10 * (pageNo - 1))
      .limit(10);

    const totalCount = await ChargingTariff.find(filter).countDocuments();

    res.status(200).json({ status: true, message: "OK", result, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.getChargingTariffListDropdown = async (req, res) => {
  const filter = {};

  try {
    const pipeline = getChargingTariffListPipeline(filter);
    const result = await ChargingTariff.aggregate(pipeline);

    const totalCount = await ChargingTariff.find(filter).countDocuments();

    res.status(200).json({ status: true, message: "OK", result, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// get chargingTariff by id
exports.getChargingTariffById = async (req, res, internalCall = false) => {
  const id = req.params.id;

  const chargingTariff = await ChargingTariff.findOne(
    id === "default" ? { isDefault: true } : { _id: id }
  );
  //    const chargingTariff = await ChargingTariff.findById(id)

  if (!chargingTariff) {
    throw new createError(404, `ChargingTariff with id ${id} not found`);
  }

  let taxPercentage = await getTaxPercentage(chargingTariff.tax);

  const value = Number(chargingTariff.value) || 0;
  const serviceAmount = Number(chargingTariff.serviceAmount) || 0;
  const energyRate = Number((value * (1 + taxPercentage)).toFixed(2));

  const result = {
    value,
    tax: taxPercentage,
    serviceAmount,
    energyRate,
    total: energyRate,
  };
  if (internalCall === true) return result;

  res.status(200).json({
    status: true,
    result,
  });
};

// get chargingTariff by id
exports.getTotalChargingTariffRate = async (req, res) => {
  const { id } = req.params;

  const chargingTariff = await ChargingTariff.findOne(
    id === "default" ? { isDefault: true } : { _id: id }
  );
  if (!chargingTariff) {
    throw new createError(404, `ChargingTariff with id ${id} not found`);
  }

  let taxPercentage = await getTaxPercentage(chargingTariff.tax);
  const value = Number(chargingTariff.value) || 0;
  const serviceAmount = Number(chargingTariff.serviceAmount) || 0;
  const energyRate = Number((value * (1 + taxPercentage)).toFixed(2));

  res.status(200).json({
    status: true,
    result: {
      value,
      tax: taxPercentage,
      serviceAmount,
      energyRate,
      total: energyRate,
    },
  });
};

// delete chargingTariff by id
exports.deleteChargingTariff = async (req, res) => {
  const { id } = req.params;

  const chargingTariff = await ChargingTariff.findByIdAndDelete(id);
  if (!chargingTariff) {
    throw new createError(404, `ChargingTariff with id ${id} not found`);
  }
  res.status(200).json(chargingTariff);
};

// update chargingTariff by id
exports.updateChargingTariff = async (req, res) => {
  const { error, value } = chargingTariffUpdateValidationSchema.validate(
    req.body
  );

  if (error) {
    throw new createError(
      400,
      error.details.map((detail) => detail.message).join(", ")
    );
  }

  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const payload = { $set: req.body };

  const chargingTariff = await ChargingTariff.findOne({ _id: id }, "name");
  if (!chargingTariff)
    throw new createError(404, `ChargingTariff with id ${id} not found`);
  if (chargingTariff.name === "Default" && req.body.hasOwnProperty("name"))
    delete req.body.name;

  const chargingTariffUpdated = await ChargingTariff.findByIdAndUpdate(
    id,
    payload,
    { new: true }
  );

  res.status(200).json(chargingTariffUpdated);
};
