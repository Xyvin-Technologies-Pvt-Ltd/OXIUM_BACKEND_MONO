const mongoose = require("mongoose");

const getChargingStationPipeline = (chargingStationId) => [
  { $match: { _id: new mongoose.Types.ObjectId(chargingStationId) } },
  {
    $lookup: {
      from: "evmachines",
      localField: "_id",
      foreignField: "location_name",
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            evModel: 1,
            CPID: 1,
            chargingTariff: 1,
            cpidStatus: 1,
            connectors: 1,
          },
        },
      ],
      as: "evMachines",
    },
  },
  { $unwind: { path: "$evMachines", preserveNullAndEmptyArrays: true } },
  {
    $lookup: {
      from: "ev_models",
      localField: "evMachines.evModel",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            _id: 1,
            charger_type: 1,
            output_type: 1,
            capacity: 1,
            no_of_ports: 1,
            connectors: 1,
          },
        },
      ],
      as: "evMachines.evModelDetails",
    },
  },
  {
    $lookup: {
      from: "chargingtariffs",
      localField: "evMachines.chargingTariff",
      foreignField: "_id",
      pipeline: [
        {
          $lookup: {
            from: "taxes",
            localField: "tax",
            foreignField: "_id",
            as: "taxDetails",
          },
        },
        {
          $unwind: {
            path: "$taxDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            "evMachines.chargingTariff": {
              charger_tariff: {
                $multiply: [
                  "$value",
                  {
                    $add: [1, { $divide: ["$taxDetails.percentage", 100] }],
                  },
                ],
              },
              value: "$value",
              serviceAmount: "$serviceAmount",
              tax_percentage: "$taxDetails.percentage",
            },
          },
        },
      ],
      as: "evMachines.chargingTariffDetails",
    },
  },
  {
    $lookup: {
      from: "reviews",
      localField: "_id",
      foreignField: "chargingStation",
      pipeline: [
        {
          $project: {
            _id: 1,
            rating: 1,
          },
        },
      ],
      as: "reviewDetails",
    },
  },
  { $unwind: { path: "$reviewDetails", preserveNullAndEmptyArrays: true } },
  {
    $group: {
      _id: "$_id",
      root: { $first: "$$ROOT" },
      evMachines: { $addToSet: "$evMachines" },
      averageRating: { $avg: "$reviewDetails.rating" },
    },
  },
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: ["$root", "$$ROOT"],
      },
    },
  },
  {
    $project: {
      _id: 1,
      name: "$root.name" || "",
      address: "$root.address" || "",
      latitude: "$root.latitude" || null,
      longitude: "$root.longitude" || null,
      rating: "$averageRating" || 1,
      image: "$root.image" || "",
      amenities: "$root.amenities" || [],
      startTime: "$root.startTime" || "",
      stopTime: "$root.stopTime" || "",
      chargers: "$evMachines",
    },
  },
];

const getChargingStationListPipeline = (longitude, latitude) => [
  {
    $geoNear: {
      near: {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      distanceField: "distance",
      spherical: true,
    },
  },
  {
    $lookup: {
      from: "evmachines",
      localField: "_id",
      foreignField: "location_name",
      pipeline: [
        {
          $lookup: {
            from: "ev_models", // Replace with your actual evModel collection name
            localField: "evModel",
            foreignField: "_id",
            pipeline: [
              {
                $project: {
                  output_type: 1,
                  capacity: 1,
                  connectors: 1,
                },
              },
            ],
            as: "evModelDetails",
          },
        },
      ],
      as: "evMachines",
    },
  },
  {
    $group: {
      _id: "$_id",
      chargingStation: { $first: "$$ROOT" },
      distance: { $first: "$distance" },
      connectors: { $push: "$evMachines.connectors" },
      connectorsType: { $push: "$evMachines.evModelDetails.connectors.type" },
    },
  },
  { $sort: { distance: 1 } },
];

const getChargingStationEvMachineListPipeline = () => [
  {
    $project: {
      _id: 1,
      name: 1,
    },
  },
  {
    $lookup: {
      from: "evmachines",
      localField: "_id",
      foreignField: "location_name",
      pipeline: [
        {
          $project: {
            _id: 1,
            CPID: 1,
          },
        },
      ],
      as: "evMachines",
    },
  },
];

const getChargingStationByIdForDashboardPipeline = (id) => [
  {
    $match: {
      _id: new mongoose.Types.ObjectId(id),
    },
  },
  {
    $lookup: {
      from: "evmachines",
      localField: "_id",
      foreignField: "location_name",
      as: "evMachines",
    },
  },
  {
    $unwind: {
      path: "$evMachines",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $lookup: {
      from: "ev_models",
      localField: "evMachines.evModel",
      foreignField: "_id",
      pipeline: [
        {
          $lookup: {
            from: "oems",
            localField: "oem",
            foreignField: "_id",
            as: "oemDetails",
          },
        },
        {
          $unwind: {
            path: "$oemDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            model_name: 1,
            oem: "$oemDetails.name",
            output_type: 1,
          },
        },
      ],
      as: "evMachines.evModelDetails",
    },
  },
  {
    $lookup: {
      from: "ocpptransactions",
      localField: "evMachines.CPID",
      foreignField: "cpid",
      as: "transactionDetails",
    },
  },
  {
    $lookup: {
      from: "chargingtariffs",
      localField: "evMachines.chargingTariff",
      foreignField: "_id",
      pipeline: [
        {
          $lookup: {
            from: "taxes",
            localField: "tax",
            foreignField: "_id",
            as: "taxDetails",
          },
        },
        {
          $unwind: {
            path: "$taxDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            tariffType: 1,
            value: 1,
            serviceAmount: 1,
            tax_name: "$taxDetails.name",
            tax_percentage: "$taxDetails.percentage",
          },
        },
      ],
      as: "evMachines.chargingTariffDetails",
    },
  },
  {
    $lookup: {
      from: "reviews",
      localField: "_id",
      foreignField: "chargingStation",
      pipeline: [
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "userDetails",
          },
        },
        {
          $unwind: {
            path: "$userDetails",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            rating: 1,
            comment: 1,
            user: "$userDetails.username",
            mobile: "$userDetails.mobile",
            email: "$userDetails.email",
          },
        },
      ],
      as: "reviewDetails",
    },
  },
  {
    $group: {
      _id: "$_id",
      root: { $first: "$$ROOT" },
      evMachines: { $addToSet: "$evMachines" },
    },
  },
  {
    $replaceRoot: {
      newRoot: {
        $mergeObjects: ["$root", "$$ROOT"],
      },
    },
  },
];

const getCPIDListByChargingStationPipeline = (id) => [
  { $match: { _id: new mongoose.Types.ObjectId(id) } },
  {
    $lookup: {
      from: "evmachines",
      localField: "_id",
      foreignField: "location_name",
      as: "evMachines",
    },
  },
  { $unwind: { path: "$evMachines", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      evMachines: "$evMachines",
    },
  },
];

module.exports = {
  getChargingStationPipeline,
  getChargingStationListPipeline,
  getChargingStationEvMachineListPipeline,
  getChargingStationByIdForDashboardPipeline,
  getCPIDListByChargingStationPipeline,
};
