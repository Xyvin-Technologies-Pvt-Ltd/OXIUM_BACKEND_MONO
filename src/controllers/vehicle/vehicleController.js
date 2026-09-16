const mongoose = require("mongoose");
const Brand = require("../../models/brandSchema");
const Vehicle = require("../../models/vehicleSchema");
const { vehicleValidationSchema } = require("../../validation");

const AWS = require("aws-sdk");
const { getVehiclePipeline, getBrandPipeline } = require("./pipes");
AWS.config.update({
  region: process.env.MY_AWS_REGION,
  accessKeyId: process.env.MY_AWS_ACCESS_KEY,
  secretAccessKey: process.env.MY_AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

const imageUploadAlone = (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: "No file" });
  }

  // Create a stream to S3
  const params = {
    Bucket: "image-upload-oxium/vehicles",
    Key: `${uniqueId}-${file.originalname}`,
    ContentType: file.mimetype,
    Body: file.buffer,
    // ACL: 'public-read' // or another ACL setting
  };

  s3.upload(params, (err, data) => {
    if (err) {
      console.error("Error uploading to S3:", err);
      return res.status(500).json({ status: false, error: err });
    }

    // If you want to send a response to the client, you can do it here
    res.status(200).json({ status: true, data: data.Location });
  });
};

const createVehicle = async (req, res) => {
  try {
    const { error, value } = vehicleValidationSchema.validate(req.body, {
      abortEarly: true,
    });
    if (error) {
      return res.status(400).json({
        status: false,
        error: error.details?.[0]?.message || "validation error",
      });
    }

    const saveData = {
      modelName: value.modelName,
      numberOfPorts: value.numberOfPorts || 1,
      brand: value.brand,
      compactable_port: value.compactable_port,
      icon: value.icon || "no image",
    };

    const savedVehicle = await new Vehicle(saveData).save();
    res.status(201).json({
      status: true,
      data: savedVehicle,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      error: error.message || "server error",
    });
  }
};

// Get all Vehicles
const getAllVehicles = async (req, res) => {
  const brands = await Brand.find();
  const allVehicles = await Vehicle.find();

  const result = brands.map((brand) => {
    const brandWiseVehicles = allVehicles.filter(
      (vehicle) => String(vehicle.brand) === String(brand._id)
    );

    return {
      brand: brand.brandName,
      vehicles: brandWiseVehicles,
    };
  });

  res.status(200).json({
    status: true,
    message: "Ok",
    result: result,
  });
};

// Get all Vehicles for dashboard
const getAllVehiclesForDashboard = async (req, res) => {
  const { pageNo, searchQuery } = req.query;

  const filter = {};

  if (searchQuery) {
    filter.$or = [
      { modelName: { $regex: searchQuery, $options: "i" } },
      { "brand.brandName": { $regex: searchQuery, $options: "i" } },
    ];
  }

  const vehiclePipeline = getVehiclePipeline(filter);

  const allVehicleData = await Vehicle.aggregate(vehiclePipeline)
    .skip(10 * (pageNo - 1))
    .limit(10);
  let totalCount = await Vehicle.find(filter).countDocuments();

  const brandIds = allVehicleData.map((vehicle) => vehicle.brand);
  const brandPipeline = getBrandPipeline(brandIds);

  const brandInfo = await Brand.aggregate(brandPipeline);
  const brandMap = new Map(
    brandInfo.map((brand) => [String(brand._id), brand.brandName])
  );
  const finalResult = allVehicleData.map((vehicle) => {
    return {
      _id: vehicle._id,
      brand: brandMap.get(String(vehicle.brand)), // Get brand name using the map
      modelName: vehicle.modelName,
      number_of_ports: vehicle.numberOfPorts,
      image: vehicle.icon,
      compactable_port: vehicle.compactable_port || [],
    };
  });

  res.status(200).json({
    status: true,
    message: "Ok",
    result: finalResult,
    totalCount,
  });
};

// Get a Vehicle by ID
const getVehicleById = async (req, res, internalCall = false) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    throw new createError(400, `Invalid id ${id}`);

  const vehicle = await Vehicle.findById(id);
  if (!vehicle) throw new createError(404, `Vehicle with id ${id} not found`);

  const brand = await Brand.findOne({ _id: vehicle.brand });
  const result = {
    ...vehicle.toObject(),
    brand: brand ? brand.brandName : "",
  };

    if (internalCall === true) return result;
  res.status(200).json({
    status: true,
    result: result,
  });
};

const getVehiclesByIds = async (req, res, internalCall = false) => {
  const idArray = req.body.idArray;
  if (!idArray) throw new createError(400, "idArray is required field");
  if (!Array.isArray(idArray))
    throw new createError(400, "idArray should be array");

  const vehicles = await Vehicle.find({ _id: { $in: idArray } });
  const brandResult = await Brand.find({
    _id: { $in: vehicles.map((x) => x.brand) },
  });

  const result = vehicles.map((vehicle) => {
    const brandFound = brandResult.find(
      (brand) => brand._id.toString() == vehicle.brand.toString()
    );

    return {
      ...vehicle.toObject(),
      brand: brandFound && brandFound.brandName,
    };
  });

    if (internalCall === true) return result;

  res.status(200).json({
    status: true,
    result: result,
  });
};

const updateVehicleById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }

  const updatedVehicle = await Vehicle.findByIdAndUpdate(id, req.body, {
    new: true,
  });
  res.status(200).json({
    status: updatedVehicle ? true : false,
    data: updatedVehicle,
  });
};

const deleteVehicleById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new createError(400, `Invalid id ${id}`);
  }
  const deletedVehicle = await Vehicle.findByIdAndDelete(id);
  if (!deletedVehicle) {
    throw new createError(404, `Vehicle with id ${id} not found`);
  }
  res.status(204).end();
};

module.exports = {
  imageUploadAlone,
  createVehicle,
  getAllVehicles,
  getAllVehiclesForDashboard,
  getVehicleById,
  getVehiclesByIds,
  updateVehicleById,
  deleteVehicleById,
};
