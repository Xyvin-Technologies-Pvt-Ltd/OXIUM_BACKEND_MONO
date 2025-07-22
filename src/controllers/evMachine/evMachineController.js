const EvMachine = require("../../models/evMachineSchema");
const createError = require("http-errors");
const EvModel = require("../../models/evModelSchema");
const createQRCode = require("../../helpers/qrCodeGen");
const {
  getChargingTariffById,
  getDefaultChargingTariff,
} = require("../configuration/chargingTariffController");

exports.createEvMachine = async (req, res) => {
  let evMachineData = req.body;
  const findMachine = await EvMachine.findOne({ CPID: evMachineData.CPID });
  if (findMachine) throw new createError(400, "Duplicate CPID found");

  // Find the EVModel by ID
  const evModel = await EvModel.findById(evMachineData.evModel);
  if (!evModel) {
    throw new Error("EVModel not found");
  }
  
  const defaultTariff = await getDefaultChargingTariff(req, res, true);

  const numberOfConnectors = evModel.no_of_ports;
  const connectors = [];

  for (let i = 1; i <= numberOfConnectors; i++) {
    let qrCodeConnector;

    let stringData = {
      cpid: evMachineData.CPID,
      connectorId: i,
      chargerName: evMachineData.CPID,
      outputType: evModel.output_type,
      capacity: evModel.capacity,
      connectorType:
        evModel.charger_type && evModel.charger_type[0]
          ? evModel.charger_type[0]
          : "",
      // tariff: defaultTariff.data.result.value.toFixed(2)
    };

    try {
      qrCodeConnector = await createQRCode(stringData);
    } catch (err) {
      console.error(err);
    }

    connectors.push({
      connectorId: i,
      status: "Unavailable",
      errorCode: "",
      qrCode: qrCodeConnector,
      info: "",
      timestamp: "",
      vendorId: "",
      vendorErrorCode: "",
    });
  }

  evMachineData.connectors = connectors;
  evMachineData.configuration_url = `ws://13.203.2.34/ocpp-ws/${evMachineData.CPID}`;
  evMachineData.chargingTariff = defaultTariff._id;

  const evMachine = new EvMachine(evMachineData);
  const savedEvMachine = await evMachine.save();
  res.status(201).json(savedEvMachine);
};

// Get a evMachine lists
exports.getEvMachineList = async (req, res) => {
  const evMachine = await EvMachine.find({});
  if (!evMachine) {
    res.status(404).json({ error: "EvMachine not found" });
  } else {
    res.status(200).send({ status: true, message: "OK", result: evMachine });
  }
};

// Get a evMachine by ID
exports.getEvMachineById = async (req, res) => {
  const evMachine = await EvMachine.findById(req.params.evMachineId);
  if (evMachine) {
    res.status(200).json({ status: true, result: evMachine, message: "Ok" });
  } else {
    res
      .status(200)
      .json({ status: false, result: null, error: "EvMachine not found" });
  }
};

// Get a evMachine by CPID
exports.getEvMachineByCPID = async (req, res) => {
  const evMachine = await EvMachine.find({ CPID: req.params.evMachineCPID });

  if (evMachine && evMachine.length > 0) {
    res.status(200).send({ status: true, result: evMachine });
  } else {
    res.status(203).send({ status: false, result: null });
  }
};

// Update a evMachine by ID
exports.updateEvMachine = async (req, res) => {
  const updatedEvMachine = await EvMachine.findByIdAndUpdate(
    req.params.evMachineId,
    { $set: req.body },
    { new: true }
  );
  if (!updatedEvMachine) {
    res.status(404).json({ error: "EvMachine not found" });
  } else {
    res.status(200).json(updatedEvMachine);
  }
};

// Delete a evMachine by ID
exports.deleteEvMachine = async (req, res) => {
  const deletedEvMachine = await EvMachine.findByIdAndDelete(
    req.params.evMachineId
  );
  if (!deletedEvMachine) {
    res.status(404).json({ error: "EvMachine not found" });
  } else {
    res.status(204).json({ status: true, message: "OK" });
  }
};

// Get a evMachine by CPID
exports.getEvMachineTariffRate = async (req, res) => {
  const evMachine = await EvMachine.findOne(
    { CPID: req.params.evMachineCPID },
    "chargingTariff"
  );
  if (!evMachine)
    return res
      .status(400)
      .json({ status: false, error: "EvMachine not found" });
  const chargingTariff = evMachine.chargingTariff
    ? evMachine.chargingTariff
    : "default";
  req.params.id = chargingTariff;
  let apiResponse = await getChargingTariffById(req, res, true);
  res.status(200).send({ status: true, result: apiResponse });
};

exports.deleteEvMachineByStationId = async (req, res) => {
  const location_name = req.params.evMachineId;
  const deletedEvMachines = await EvMachine.deleteMany({
    location_name: location_name,
  });
  if (!deletedEvMachines) {
    res.status(404).json({ error: "EvMachine not found" });
  } else {
    res.status(204).json({ status: true, message: "OK" });
  }
};

exports.addConnector = async (req, res) => {
  if (!req.body.connectorId)
    throw new createError(404, `connectorId is a required field`);
  const connectorId = req.body.connectorId;
  const connectorType = req.body.connectorType;

  const evMachine = await EvMachine.findOne(
    { _id: req.params.evMachineId },
    "connectors"
  );
  if (!evMachine) throw new createError(404, `evMachine not found`);

  //if a connector with same connectorId found in collection, throw error
  let connectorFound = evMachine.connectors.find(
    (x) => x.connectorId === connectorId
  );
  if (connectorFound) throw new createError(404, `duplicate connectorId found`);

  const updatedEvMachine = await EvMachine.findByIdAndUpdate(
    req.params.evMachineId,
    {
      $push: {
        connectors: { connectorId, connectorType, status: req.body.status },
      },
    },
    { new: true }
  );

  res.status(200).json(updatedEvMachine);
};

//remove
exports.removeConnector = async (req, res) => {
  if (!req.body.connectorId)
    throw new createError(404, `connectorId is a required field`);
  const connectorId = req.body.connectorId;

  const evMachine = await EvMachine.findOne(
    { _id: req.params.evMachineId },
    "connectors"
  );
  if (!evMachine) throw new createError(404, `evMachine not found`);

  const connectors = evMachine.connectors;

  //if a connector with same connectorId found in collection, throw error
  let indexToRemove = connectors.findIndex(
    (x) => x.connectorId === connectorId
  );
  if (indexToRemove === -1) throw new createError(404, `connectorId not found`);

  connectors.splice(indexToRemove, 1);

  const updatedEvMachine = await EvMachine.findByIdAndUpdate(
    req.params.evMachineId,
    { $set: { connectors } },
    { new: true }
  );

  res.status(200).json(updatedEvMachine);
};

// Get update status by CPID connector
exports.updateStatusConnector = async (req, res) => {
  const connector = req.body.connectorId;
  const evMachineCPID = req.params.evMachineCPID;
  const status = req.body.status;
  const errorCode = req.body.errorCode;

  let evMachine = await EvMachine.findOne(
    { CPID: evMachineCPID },
    "connectors"
  );
  console.log("🚀 ~ exports.updateStatusConnector= ~ evMachine:", evMachine)
  if (!evMachine)
    throw new createError(400, `EvMachine ${evMachineCPID} not Found`);

  if (evMachine) {
    let connectors = evMachine.connectors;
    console.log("🚀 ~ exports.updateStatusConnector= ~ connectors:", connectors)
    let connectorFound = connectors.find((x) => x.connectorId == connector);
    if (!connectorFound) {
      return res.status(400).json({ error: "Connector 0" });
    }
    if (connectorFound) {
      connectorFound.status = status;
      connectorFound.errorCode = errorCode;

      let updated = await EvMachine.findOneAndUpdate(
        { CPID: evMachineCPID },
        { $set: { connectors } },
        { new: true }
      );

      res.status(200).send({ status: true, result: updated });
    } else
      res.status(200).send({
        status: false,
        result: null,
        message: "connector not found in Ev Machine",
      });
  } else
    res
      .status(200)
      .send({ status: false, result: null, message: "Ev Machine not found" });
};

// Get update status by CPID connector
exports.updateStatusCPID = async (req, res) => {
  const evMachineCPID = req.params.evMachineCPID;
  const status = req.body.status;
  console.log(`Update status for CPID: ${evMachineCPID}, Status: ${status}`);
  let evMachine = await EvMachine.findOne({ CPID: evMachineCPID });
  if (!evMachine)
    throw new createError(400, `EvMachine ${evMachineCPID} not Found`);
  let updated;

  if (status === "Unavailable") {
    updated = await EvMachine.findOneAndUpdate(
      { CPID: evMachineCPID },
      { $set: { cpidStatus: status, "connectors.$[].status": status } },
      { new: true }
    );
  } else {
    updated = await EvMachine.findOneAndUpdate(
      { CPID: evMachineCPID },
      { $set: { cpidStatus: status } },
      { new: true }
    );
  }

  res.status(200).json({ status: true, result: updated });
};

exports.getEvByLocation = async (req, res) => {
  const locationIds = req.body.locations;
  const getCPID = await EvMachine.find({
    location_name: { $in: locationIds },
  }).select("CPID");
  if (getCPID.length > 0) {
    res.status(200).json({ status: true, message: "OK", data: getCPID });
  } else {
    res.status(200).json({ status: true, message: "No data found" });
  }
};
