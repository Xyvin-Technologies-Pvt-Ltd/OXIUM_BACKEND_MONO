const mongoose = require("mongoose");
const moment = require("moment");
const getEvModelsPipeline = (filter) => [
  { $sort: { updatedAt: -1 } },
  {
    $lookup: {
      from: "oems",
      localField: "oem",
      foreignField: "_id",
      as: "oemDetails",
    },
  },
  { $match: filter },
  {
    $project: {
      _id: 1,
      oem: { $arrayElemAt: ["$oemDetails.name", 0] },
      model_name: 1,
      output_type: 1,
      ocpp_version: 1,
      charger_type: 1,
      capacity: 1,
      no_of_ports: 1,
      connectors: 1,
    },
  },
];

const getDashboardListPipeline = (filter, locations) => {
  if (locations) {
    filter["chargingStationDetails._id"] = { $in: locations };
  }

  return [
    { $sort: { updatedAt: -1 } },
    {
      $lookup: {
        from: "chargingstations",
        localField: "location_name",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              _id: 1,
              name: 1,
              address: 1,
              published: 1,
            },
          },
        ],
        as: "chargingStationDetails",
      },
    },
    {
      $lookup: {
        from: "ev_models",
        localField: "evModel",
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
        as: "evModelDetails",
      },
    },
    {
      $lookup: {
        from: "chargingtariffs",
        localField: "chargingTariff",
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
        as: "chargingTariffDetails",
      },
    },
    {
      $unwind: {
        path: "$chargingStationDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$evModelDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$chargingTariffDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    { $match: filter },
    {
      $project: {
        _id: 1,
        CPID: 1,
        cpidStatus: 1,
        name: 1,
        published: 1,
        chargingStation: "$chargingStationDetails.name",
        chargingTariff: "$chargingTariffDetails.tax_name",
        evModel: "$evModelDetails.model_name",
        oem: "$evModelDetails.oem",
        authorization_key: 1,
        serial_number: 1,
        chargepoint_ref_id: 1,
        commissioned_date: 1,
        configuration_url: 1,
        cpidStatus: 1,
        createdAt: 1,
      },
    },
  ];
};

const getTariffPipeline = (cpid) => [
  { $match: { CPID: cpid } },
  {
    $lookup: {
      from: "chargingtariffs",
      localField: "chargingTariff",
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
            name: 1,
            tariffType: 1,
            value: 1,
            serviceAmount: 1,
            tax_name: "$taxDetails.name",
            tax_percentage: "$taxDetails.percentage",
          },
        },
      ],
      as: "chargingTariffDetails",
    },
  },
  {
    $unwind: {
      path: "$chargingTariffDetails",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $project: {
      _id: 1,
      CPID: 1,
      chargingTariffDetail: "$chargingTariffDetails",
    },
  },
];

const getDashboardListByIdPipeline = (id) => [
  { $match: { _id: new mongoose.Types.ObjectId(id) } },
  {
    $lookup: {
      from: "chargingstations",
      localField: "location_name",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            address: 1,
            published: 1,
          },
        },
      ],
      as: "chargingStationDetails",
    },
  },
  {
    $lookup: {
      from: "ev_models",
      localField: "evModel",
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
            ocpp_version: 1,
            charger_type: 1,
            capacity: 1,
            no_of_ports: 1,
            connectors: 1,
            model_name: 1,
          },
        },
      ],
      as: "evModelDetails",
    },
  },
  {
    $lookup: {
      from: "ocpptransactions",
      localField: "CPID",
      foreignField: "cpid",
      as: "transactionDetails",
    },
  },
  {
    $project: {
      _id: 1,
      name: 1,
      CPID: 1,
      authorization_key: 1,
      configuration_url: 1,
      serial_number: 1,
      commissioned_date: 1,
      published: 1,
      connectors: 1,
      cpidStatus: 1,
      chargingStationDetails: 1,
      evModelDetails: 1,
      numTransactions: { $size: "$transactionDetails" },
      totalAmountReceived: {
        $round: [
          {
            $sum: "$transactionDetails.totalAmount",
          },
          2,
        ],
      },
      totalEnergyUsed: {
        $sum: {
          $map: {
            input: "$transactionDetails",
            as: "transaction",
            in: {
              $sum: [
                {
                  $subtract: [
                    "$$transaction.meterStop",
                    "$$transaction.meterStart",
                  ],
                },
              ],
            },
          },
        },
      },
    },
  },
];

const getReport2Pipeline = (filters) => [
  { $match: filters },
  { $sort: { updatedAt: -1 } },
  {
    $lookup: {
      from: "chargingstations",
      localField: "location_name",
      foreignField: "_id",
      pipeline: [
        {
          $project: {
            _id: 1,
            name: 1,
            address: 1,
            published: 1,
            state: 1,
            city: 1,
            latitude: 1,
            longitude: 1,
          },
        },
      ],
      as: "chargingStationDetails",
    },
  },
  {
    $lookup: {
      from: "ev_models",
      localField: "evModel",
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
            charger_type: 1,
            connectors: 1,
            capacity: 1,
          },
        },
      ],
      as: "evModelDetails",
    },
  },
  {
    $lookup: {
      from: "chargingtariffs",
      localField: "chargingTariff",
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
      as: "chargingTariffDetails",
    },
  },
  {
    $unwind: {
      path: "$chargingStationDetails",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $unwind: {
      path: "$evModelDetails",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $unwind: {
      path: "$chargingTariffDetails",
      preserveNullAndEmptyArrays: true,
    },
  },
  {
    $project: {
      _id: 1,
      CPID: 1,
      cpidStatus: 1,
      name: 1,
      published: 1,
      chargingStation: "$chargingStationDetails.name",
      latitude: "$chargingStationDetails.latitude",
      longitude: "$chargingStationDetails.longitude",
      state: "$chargingStationDetails.state",
      chargingTariffDetails: "$chargingTariffDetails",
      chargingTariff: "$chargingTariffDetails.tax_name",
      chargingTariffType: "$chargingTariffDetails.tariffType",
      chargingTariffTax: "$chargingTariffDetails.tax",
      model: "$evModelDetails.model_name",
      connectorStandard: "$evModelDetails.output_type",
      tax_percentage: "$chargingTariffDetails.tax_percentage",
      connectors: "$evModelDetails.connectors",
      chargerTypes: "$evModelDetails.charger_type",
      capacity: "$evModelDetails.capacity",
      oem: "$evModelDetails.oem",
      authorization_key: 1,
      serial_number: 1,
      commissioned_date: 1,
      configuration_url: 1,
      cpidStatus: 1,
      createdAt: 1,
    },
  },
];

const getReportPipeline = (startDate, endDate, location) => {
  const matchStage = {
    $match: {},
  };

  if (startDate && endDate) {
    const dateFormat = "DD-MM-YYYY";
    const startMoment = moment(startDate, dateFormat);
    const endMoment = moment(endDate, dateFormat).endOf("day");
    matchStage.$match.createdAt = {
      $gte: startMoment.toDate(),
      $lte: endMoment.toDate(),
    };
  }

  if (location)
    matchStage.$match.location_name = new mongoose.Types.ObjectId(location);

  return [
    matchStage,
    {
      $lookup: {
        from: "chargingstations",
        localField: "location_name",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              name: 1,
            },
          },
        ],
        as: "location",
      },
    },
    {
      $unwind: {
        path: "$location",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        authorization_key: 1,
        serial_number: 1,
        commissioned_date: 1,
        published: 1,
        evModel: 1,
        CPID: 1,
        chargingTariff: 1,
        connectors: {
          $map: {
            input: "$connectors",
            as: "connector",
            in: {
              connectorId: "$$connector.connectorId",
              status: "$$connector.status",
              errorCode: "$$connector.errorCode",
              info: "$$connector.info",
              timestamp: "$$connector.timestamp",
              vendorId: "$$connector.vendorId",
              vendorErrorCode: "$$connector.vendorErrorCode",
              _id: "$$connector._id",
            },
          },
        },
        configuration_url: 1,
        cpidStatus: 1,
        createdAt: 1,
        updatedAt: 1,
        location: "$location.name",
      },
    },
  ];
};

module.exports = {
  getEvModelsPipeline,
  getDashboardListPipeline,
  getTariffPipeline,
  getDashboardListByIdPipeline,
  getReport2Pipeline,
  getReportPipeline,
};
