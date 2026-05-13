const createError = require("http-errors");
const ChargingStation = require("../../models/chargingStationSchema");
const { signAccessToken } = require("../../utils/jwt_helper");
const {
  getChargingStationPipeline,
  getChargingStationListPipeline,
} = require("./pipes");
const { getUserByMobileNo } = require("../user/userBasicCRUDControllers");
const { pushRole } = require("../user/adminController");
const { getAverageRating } = require("../review/reviewController");
const { getSoC } = require("../../services/ocppServiceApis");
const findCommonReturnData =
  "name address latitude longitude chargers status type image startTime stopTime amenities owner createdAt";

// Create a new chargingStations
exports.createChargingStation = async (req, res) => {
  const { latitude, longitude, ...otherFields } = req.body;

  const chargingStation = new ChargingStation({
    location: {
      type: "Point", // Assuming 'Point' as the default type
      coordinates: [longitude, latitude],
    },
    latitude: latitude,
    longitude: longitude,
    ...otherFields,
  });

  const savedChargingStation = await chargingStation.save();
  req.params.id = req.roleDoc?._id?.toString();
  if (!req.params.id) {
    return res
      .status(403)
      .json({ status: false, message: "Forbidden: invalid role scope" });
  }
  req.body.location_access = savedChargingStation._id;
  const upRole = await pushRole(req, res, true);
  let token = await signAccessToken(String(req.userId), upRole, "");
  res.status(201).json({
    status: true,
    message: "Ok",
    result: savedChargingStation,
    token: token,
  });
};

// Get a chargingStation list
exports.getChargingStationList = async (req, res) => {
  const chargingStation = await ChargingStation.find({}, findCommonReturnData);
  if (!chargingStation) {
    res
      .status(404)
      .json({ status: false, message: "Charging Station not found" });
  } else {
    res
      .status(200)
      .json({ status: true, message: "Ok", result: chargingStation });
  }
};

exports.getChargingStationById = async (req, res) => {
  const userMobileNo = req.body.mobileNo;
  const chargingStationId = req.params.chargingStationId;

  if (!userMobileNo)
    return res
      .status(400)
      .json({ status: false, message: "mobileNo is a required field" });

  try {
    req.params.mobileNo = userMobileNo;
    const userApiResponse = await getUserByMobileNo(req, res, true);
    const userFavoriteStations = userApiResponse.favoriteStations;

    const chargingStation = await ChargingStation.findById(chargingStationId);
    if (!chargingStation)
      return res
        .status(404)
        .json({ status: false, message: "Charging Station not found" });

    const pipedData = await ChargingStation.aggregate(
      getChargingStationPipeline(chargingStationId)
    );
    const final_result = pipedData[0];

    const chargers_output = await Promise.all(
      final_result.chargers.map(async (charger) => {
        const connectorTypes = charger.evModelDetails
          ? charger.evModelDetails[0].connectors.map((connector) => ({
              ...connector,
              connectorType: connector.type || "Unknown",
            }))
          : [];

        const connectorStatus = await fetchConnectorsWithSoC(
          charger.connectors,
          charger
        );

        const combinedConnectors = connectorTypes.map((connectorType) => {
          const statusMatch = connectorStatus.find(
            (status) => status.connectorId === connectorType.connectorId
          );
          return {
            ...connectorType,
            ...(statusMatch && statusMatch),
          };
        });

        return {
          _id: charger._id,
          name: charger.name,
          evModel: charger.evModel,
          CPID: charger.CPID,
          chargingTariff: charger.chargingTariff,
          cpidStatus: charger.cpidStatus,
          output_types: charger.evModelDetails
            ? charger.evModelDetails[0].output_type
            : 0,
          charger_types: charger.evModelDetails
            ? charger.evModelDetails[0].charger_types
            : 0,
          capacity: charger.evModelDetails
            ? charger.evModelDetails[0].capacity
            : null,
          no_of_ports: charger.evModelDetails
            ? charger.evModelDetails[0].no_of_ports
            : 0,
          connectors:
            combinedConnectors.length > 0 ? combinedConnectors : "nil",
          charger_tariff: charger.chargingTariffDetails
            ? parseFloat(
                charger.chargingTariffDetails[0].evMachines.chargingTariff.charger_tariff.toFixed(
                  2
                )
              )
            : 0,
        };
      })
    );

    const result = {
      _id: final_result._id,
      name: final_result.name || "",
      address: final_result.address || "",
      latitude: final_result.latitude || null,
      longitude: final_result.longitude || null,
      rating: final_result.rating || 1,
      image: final_result.image || "",
      amenities: final_result.amenities || [],
      startTime: final_result.startTime || "",
      stopTime: final_result.stopTime || "",
      isFavorite: userFavoriteStations.includes(chargingStation._id.toString()),
      chargers: chargers_output || [],
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

exports.updateChargingStation = async (req, res) => {
  const chargingStationId = req.params.chargingStationId;
  const { latitude, longitude, ...otherFields } = req.body;

  let updateFields = {
    latitude: latitude,
    longitude: longitude,
    ...otherFields,
  };

  if (latitude !== undefined && longitude !== undefined) {
    updateFields.location = {
      type: "Point", // Assuming 'Point' as the default type
      coordinates: [longitude, latitude],
    };
  }

  const updatedChargingStation = await ChargingStation.findByIdAndUpdate(
    chargingStationId,
    { $set: updateFields },
    { new: true }
  );
  if (!updatedChargingStation) {
    res
      .status(404)
      .json({ status: false, message: "Charging Station not found" });
  } else {
    res.status(200).json(updatedChargingStation);
  }
};

// Delete a chargingStation by ID
exports.deleteChargingStation = async (req, res) => {
  const isExist = await ChargingStation.findById(req.params.chargingStationId);
  await deleteChargers(req.params.chargingStationId);
  const deletedChargingStation = await ChargingStation.findByIdAndDelete(
    req.params.chargingStationId
  );
  // const deletedChargingStation = true;
  if (!deletedChargingStation) {
    res
      .status(404)
      .json({ status: false, message: "Charging Station not found" });
  } else {
    if (req.roleDoc?._id) {
      await removeLoc(req.roleDoc._id, req.params.chargingStationId);
    }
    res.status(204).end();
  }
};

// Get a chargingStation list
exports.getFavoriteChargingStationList = async (req, res) => {
  const userMobileNo = req.body.mobileNo;
  if (!userMobileNo)
    return res.status(400).json({
      status: false,
      status: false,
      message: "mobileNo is a required field",
    });
  req.params.mobileNo = userMobileNo;
  let apiResponse = await getUserByMobileNo(req, res, true);
  const userFavoriteStations = apiResponse.favoriteStations;
  let chargingStations = await ChargingStation.find(
    { _id: { $in: userFavoriteStations } },
    findCommonReturnData
  );
  req.params.evMachine = "null";
  chargingStations = await Promise.all(
    chargingStations.map(async (chargingStation) => {
      req.params.chargingStation = chargingStation._id;
      return {
        id: chargingStation._id,
        name: chargingStation.name,
        address: chargingStation.address,
        rating: await getAverageRating(req, res, true), // Now properly awaited
        image: chargingStation.image || "",
        latitude: chargingStation.latitude || null,
        longitude: chargingStation.longitude || null,
      };
    })
  );
  res
    .status(200)
    .json({ status: true, message: "Ok", result: chargingStations });
};

// Get a chargingStation list
exports.getChargingStationUpdatedList = async (req, res) => {
  const { latitude, longitude } = req.body;

  try {
    const chargingStationList = await ChargingStation.aggregate(
      getChargingStationListPipeline(longitude, latitude)
    );

    const result = await Promise.all(
      chargingStationList.map(async (station) => {
        let connectorsArray = station.connectors[0];
        const flatArray = connectorsArray.reduce(
          (acc, curr) => acc.concat(curr),
          []
        );

        const hasAvailableConnector = flatArray.some(
          (connector) => connector.status === "Available"
        );
        const hasUnavailableConnector = flatArray.every(
          (connector) => connector.status === "Unavailable"
        );
        const validConnectorStatus = ["Preparing", "Charging", "Finishing"];
        const hasBusyConnector = flatArray.every((connector) =>
          validConnectorStatus.includes(connector.status)
        );

        let flattenedBeforeConnectorsType = station.connectorsType[0];
        const uniqueArrays = [];
        const flattenedConnectorsType = flattenedBeforeConnectorsType.reduce(
          (acc, types) => {
            const isDuplicate = uniqueArrays.some(
              (array) => JSON.stringify(array) === JSON.stringify(types)
            );
            if (!isDuplicate) {
              uniqueArrays.push(types);
              return acc.concat(types);
            }
            return acc;
          },
          []
        );

        const uniqueArrays2 = [];
        const flattenedConnectorsType2 = flattenedConnectorsType.reduce(
          (acc, types) => {
            const isDuplicate = uniqueArrays2.some(
              (array) => JSON.stringify(array) === JSON.stringify(types)
            );
            if (!isDuplicate) {
              uniqueArrays2.push(types);
              return acc.concat(types);
            }
            return acc;
          },
          []
        );

        const onlyOne = [...new Set(flattenedConnectorsType2)];

        const charger_status = hasAvailableConnector
          ? "Online"
          : hasUnavailableConnector
          ? "Offline"
          : "Busy";

        const evModelDetails =
          station.chargingStation.evMachines[0]?.evModelDetails[0];

        let station1 = station.chargingStation;
        req.params.evMachine = "null";
        req.params.chargingStation = station1._id;
        return {
          _id: station1._id,
          name: station1.name || "",
          address: station1.address || "",
          latitude: station1.latitude || null,
          longitude: station1.longitude || null,
          rating: await getAverageRating(req, res, true),
          isBusy: hasBusyConnector ? true : false,
          image: station1.image || "",
          amenities: station1.amenities,
          startTime: station1.startTime,
          owner: station1.owner,
          stopTime: station1.stopTime,
          charger_status: charger_status,
          outputType: evModelDetails?.output_type
            ? evModelDetails[0]?.output_type
            : "nil",
          connectorType: onlyOne || [],
          capacity: evModelDetails?.capacity || "",
        };
      })
    );

    res.status(200).json({ status: true, message: "Ok", result: result });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Get a chargingStation list
exports.getChargingStationListByName = async (req, res) => {
  const name = req.body.name;
  if (!name) throw new createError(400, "name required in body");

  const regexPattern = new RegExp(name, "i");
  const chargingStations = await ChargingStation.find(
    { name: regexPattern },
    "latitude longitude name address"
  );

  res
    .status(200)
    .json({ status: true, message: "Ok", result: chargingStations });
};

exports.inbetweenPointsList = async (req, res) => {
  const { coordinates } = req.body;

  if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
    throw new Error(400, "Invalid or missing coordinates");
  }

  // Validate all coordinate pairs
  if (
    coordinates.some(
      (coord) =>
        !Array.isArray(coord) ||
        coord.length !== 2 ||
        coord.some((num) => typeof num !== "number")
    )
  ) {
    return res
      .status(400)
      .json({ error: "Each coordinate must be an array of two numbers." });
  }

  const convertedCoords = coordinates.map((coord) => [coord[1], coord[0]]);

  // Ensure the polygon is closed
  if (
    convertedCoords[0][0] !== convertedCoords[convertedCoords.length - 1][0] ||
    convertedCoords[0][1] !== convertedCoords[convertedCoords.length - 1][1]
  ) {
    convertedCoords.push([...convertedCoords[0]]); // Close the polygon
  }

  const routePath = {
    type: "Polygon",
    coordinates: [convertedCoords],
  };

  console.log("GeoJSON Object:", JSON.stringify(routePath));

  const stations = await ChargingStation.find({
    location: {
      $geoWithin: {
        $geometry: routePath,
      },
    },
  });

  res
    .status(200)
    .json({ success: true, count: stations.length, data: stations });
};

const fetchConnectorsWithSoC = async (connectors, charger) => {
  if (!connectors) return [];
  return await Promise.all(
    connectors.map(async (connector) => {
      let SOC = await getSoC(charger.name, connector.connectorId);
      return {
        ...connector,
        status: connector.status || "Unknown",
        currentSoc: String(SOC) || "0",
      };
    })
  );
};
