const mongoose = require("mongoose");
const createError = require("http-errors");
const Tax = require("../../models/taxSchema");
const { taxValidationSchema } = require("../../validation");

// create tax
exports.createTax = async (req, res) => {
  console.log(req.body);
  const { error, value } = taxValidationSchema.validate(req.body);

  if (error) {
    throw new createError(
      400,
      error.details.map((detail) => detail.message).join(", ")
    );
  }

  value.status = value.status ? "Active" : "Inactive";
  const tax = new Tax(value);
  const savedTax = await tax.save();
  res.status(201).json(savedTax);
};

// get all tax with
exports.getTaxList = async (req, res) => {
  const { pageNo, searchQuery } = req.query;

  const filter = {};

  if (searchQuery) {
    filter.$or = [{ name: { $regex: searchQuery, $options: "i" } }];
  }
  const taxs = await Tax.find(filter)
    .skip(10 * (pageNo - 1))
    .limit(10);
  let totalCount = await Tax.find(filter).countDocuments();
  res.status(200).json({ taxs, totalCount });
};

exports.getTaxListDropdown = async (req, res) => {
  const filter = {};

  const taxs = await Tax.find(filter);
  let totalCount = await Tax.find(filter).countDocuments();
  res.status(200).json({ taxs, totalCount });
};

// get tax by id
exports.getTaxById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const tax = await Tax.findById(id);
  if (!tax) {
    throw new createError(404, `Tax with id ${id} not found`);
  }
  res.status(200).json(tax);
};

// get tax by id
exports.getTaxPercentage = async (id) => {
  const tax = await Tax.findById(id, "percentage");
  if (!tax) throw new createError(404, `Tax with id ${id} not found`);

  return tax.percentage / 100;
};

// update tax by id
exports.updateTax = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const payload = { $set: req.body };

  const tax = await Tax.findByIdAndUpdate(id, payload, { new: true });
  if (!tax) {
    throw new createError(404, `Tax with id ${id} not found`);
  }
  res.status(200).json(tax);
};

// delete tax by id
exports.deleteTax = async (req, res) => {
  const { id } = req.params;

  const tax = await Tax.findByIdAndDelete(id);
  if (!tax) {
    throw new createError(404, `Tax with id ${id} not found`);
  }
  res.status(200).json(tax);
};
