const mongoose = require("mongoose");
const ChargingStation = require("../../models/chargingStationSchema");
const EvMachine = require("../../models/evMachineSchema");
const USER = require("../../models/userSchema");
const { getSoC } = require("../../services/ocppServiceApis");

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Number(d.toFixed(2));
}

/**
 * 1. Single Optimized Operator API to get all Stations, Chargers & Connectors
 * Endpoint: GET /api/v1/operator/stations
 * Query / Body Params: ?latitude=...&longitude=...
 */
exports.getOperatorStations = async (req, res) => {
  try {
    const userLat = parseFloat(req.query.latitude || req.body?.latitude);
    const userLon = parseFloat(req.query.longitude || req.body?.longitude);
    const hasCoords = !isNaN(userLat) && !isNaN(userLon);

    const pipeline = [
      {
        $lookup: {
          from: "evmachines",
          localField: "_id",
          foreignField: "location_name",
          pipeline: [
            {
              $lookup: {
                from: "ev_models",
                localField: "evModel",
                foreignField: "_id",
                as: "modelDetails",
              },
            },
            {
              $unwind: {
                path: "$modelDetails",
                preserveNullAndEmptyArrays: true,
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
                ],
                as: "tariffDetails",
              },
            },
            {
              $unwind: {
                path: "$tariffDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                name: 1,
                CPID: 1,
                cpidStatus: 1,
                serial_number: 1,
                connectors: 1,
                output_type: "$modelDetails.output_type",
                charger_types: "$modelDetails.charger_type",
                capacity: "$modelDetails.capacity",
                no_of_ports: "$modelDetails.no_of_ports",
                modelConnectors: "$modelDetails.connectors",
                tariff: {
                  $cond: {
                    if: "$tariffDetails.value",
                    then: {
                      $multiply: [
                        "$tariffDetails.value",
                        {
                          $add: [
                            1,
                            {
                              $divide: [
                                { $ifNull: ["$tariffDetails.taxDetails.percentage", 18] },
                                100,
                              ],
                            },
                          ],
                        },
                      ],
                    },
                    else: 18.5,
                  },
                },
              },
            },
          ],
          as: "chargers",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          address: 1,
          latitude: 1,
          longitude: 1,
          status: 1,
          image: 1,
          amenities: 1,
          owner: 1,
          startTime: 1,
          stopTime: 1,
          chargers: 1,
        },
      },
      { $sort: { name: 1 } },
    ];

    const rawStations = await ChargingStation.aggregate(pipeline);

    // Format clean, nested structure for the operator interface
    const formattedStations = rawStations.map((st) => {
      let isAnyChargerAvailable = false;
      let isAnyChargerBusy = false;

      const chargersList = (st.chargers || []).map((ch) => {
        const cpidStatus = ch.cpidStatus || "Unavailable";
        if (cpidStatus === "Available") isAnyChargerAvailable = true;
        if (cpidStatus === "Busy" || cpidStatus === "Charging") isAnyChargerBusy = true;

        // Merge model definition with live connectors state
        const modelConnectors = ch.modelConnectors || [];
        const liveConnectors = ch.connectors || [];

        let guns = [];
        if (modelConnectors.length > 0) {
          guns = modelConnectors.map((mc) => {
            const matchLive = liveConnectors.find(
              (lc) => lc.connectorId === mc.connectorId
            );
            return {
              id: mc.connectorId,
              type: mc.type || ch.output_type || "Type 2",
              status: matchLive?.status || (cpidStatus === "Available" ? "Available" : "Unavailable"),
              energy: mc.energy || (ch.capacity ? `${ch.capacity} kW` : "Fast DC"),
              tariff: ch.tariff ? parseFloat(Number(ch.tariff).toFixed(2)) : 18.5,
            };
          });
        } else if (liveConnectors.length > 0) {
          guns = liveConnectors.map((lc) => ({
            id: lc.connectorId,
            type: ch.output_type || "Type 2 / CCS2",
            status: lc.status || "Unavailable",
            energy: ch.capacity ? `${ch.capacity} kW` : "Fast DC",
            tariff: ch.tariff ? parseFloat(Number(ch.tariff).toFixed(2)) : 18.5,
          }));
        } else {
          guns = [
            {
              id: 1,
              type: ch.output_type || "CCS2 Fast DC",
              status: cpidStatus === "Available" ? "Available" : "Unavailable",
              energy: ch.capacity ? `${ch.capacity} kW` : "Fast DC",
              tariff: ch.tariff ? parseFloat(Number(ch.tariff).toFixed(2)) : 18.5,
            },
          ];
        }

        return {
          _id: ch._id,
          cpid: ch.CPID,
          name: ch.name || ch.CPID,
          status: cpidStatus,
          power: ch.capacity ? `${ch.capacity} kW` : "Fast DC",
          outputType: ch.output_type || "DC",
          guns: guns,
        };
      });

      const overallStatus = isAnyChargerBusy
        ? "Busy"
        : isAnyChargerAvailable
        ? "Available"
        : st.status || "Offline";

      const primaryPower = chargersList[0]?.power || "60 kW DC Fast";

      let distanceKm = null;
      if (hasCoords && st.latitude != null && st.longitude != null) {
        distanceKm = getDistanceFromLatLonInKm(
          userLat,
          userLon,
          parseFloat(st.latitude),
          parseFloat(st.longitude)
        );
      }

      return {
        _id: st._id,
        name: st.name || "GOECM Charging Hub",
        address: st.address || "Nepal Network",
        location: st.address ? st.address.split(",").slice(-3).join(",").trim() : "GOECM Network",
        latitude: st.latitude,
        longitude: st.longitude,
        distance: distanceKm,
        status: overallStatus,
        power: primaryPower,
        totalChargers: chargersList.length,
        chargers: chargersList,
      };
    });

    if (hasCoords) {
      formattedStations.sort((a, b) => {
        if (a.distance == null && b.distance == null) return 0;
        if (a.distance == null) return 1;
        if (b.distance == null) return -1;
        return a.distance - b.distance;
      });
    }

    res.status(200).json({
      status: true,
      message: "Ok",
      totalStations: formattedStations.length,
      userLocation: hasCoords ? { latitude: userLat, longitude: userLon } : null,
      result: formattedStations,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch operator stations",
    });
  }
};

/**
 * 2. Operator Profile & Wallet Information
 * Endpoint: GET /api/v1/operator/profile
 */
exports.getOperatorProfile = async (req, res) => {
  try {
    const userId = req.userId || req.query.userId;
    const mobileNo = req.query.mobileNo || "+918138916303";

    let user = null;
    if (userId) {
      user = await USER.findOne({
        $or: [
          mongoose.Types.ObjectId.isValid(userId) ? { _id: userId } : null,
          { userId: userId },
        ].filter(Boolean),
      });
    }
    if (!user) {
      user = await USER.findOne({
        $or: [{ mobile: mobileNo }, { username: mobileNo }],
      });
    }

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "Operator user not found",
      });
    }

    res.status(200).json({
      status: true,
      message: "Ok",
      result: {
        _id: user._id,
        userId: user.userId,
        username: user.username,
        mobile: user.mobile,
        wallet: user.wallet || 0,
        rfidTag: user.rfidTag || [],
        name: user.name || "GOEC Operator",
        total_sessions: user.total_sessions || 0,
        total_units: user.total_units || 0,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch operator profile",
    });
  }
};

/**
 * 3. Operator Active Sessions Filtered by Operator User
 * Endpoint: GET /api/v1/operator/activeSessions
 */
exports.getOperatorActiveSessions = async (req, res) => {
  const axios = require("axios");
  const generateToken = require("../../utils/generateToken");
  const staticGlobalUrl = process.env.OCPP_SERVICE_URL || "http://13.203.2.34:6500";

  try {
    const userId = req.userId || req.query.userId;
    const mobileNo = req.query.mobileNo || "+918138916303";

    let user = null;
    if (userId) {
      user = await USER.findOne({
        $or: [
          mongoose.Types.ObjectId.isValid(userId) ? { _id: userId } : null,
          { userId: userId },
        ].filter(Boolean),
      });
    }
    if (!user) {
      user = await USER.findOne({
        $or: [{ mobile: mobileNo }, { username: mobileNo }],
      });
    }

    const token = await generateToken(process.env.AUTH_SECRET || "Nz9rG9y6dA3jT5wP8qZ4xW6sVlM7tR0eK2iS3uQ5oX8vC7bP");
    const ocppRes = await axios.get(`${staticGlobalUrl}/api/v1/ocpp/dashboard/activeSession`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });

    const rawSessions = Array.isArray(ocppRes.data)
      ? ocppRes.data
      : Array.isArray(ocppRes.data?.result)
      ? ocppRes.data.result
      : Array.isArray(ocppRes.data?.data)
      ? ocppRes.data.data
      : [];

    if (!user) {
      return res.status(200).json({ status: true, message: "Ok", result: rawSessions });
    }

    // Normalized user matchers
    const userIds = [String(user.userId || ""), String(user._id || "")].filter(Boolean);
    const userPhoneClean = String(user.mobile || "").replace(/\D/g, "").slice(-10);
    const userRfidTags = Array.isArray(user.rfidTag) ? user.rfidTag.map(String) : [];
    const username = String(user.username || "").toLowerCase();

    const userSessions = rawSessions.filter((s) => {
      const sIdTag = String(s.idTag || s["ID Tag"] || s["id_tag"] || s.idtag || s.tagId || "").trim();
      const sUserId = String(s.userId || s.user_id || s["User ID"] || s.user || "").trim();
      const sUsername = String(s.username || s["User Name"] || s.userName || "").trim().toLowerCase();
      const sMobileClean = String(s.mobile || s.phone || s["Mobile"] || s.userMobile || "").replace(/\D/g, "").slice(-10);

      const matchIdTag = userIds.some(id => id && sIdTag.toLowerCase() === id.toLowerCase()) || 
                         userRfidTags.some(tag => tag && sIdTag.toLowerCase() === tag.toLowerCase()) || 
                         (userPhoneClean && sIdTag.includes(userPhoneClean));
      const matchUserId = userIds.some(id => id && sUserId.toLowerCase() === id.toLowerCase());
      const matchUsername = username && (sUsername === username || (userPhoneClean && sUsername.includes(userPhoneClean)));
      const matchMobile = userPhoneClean && sMobileClean && userPhoneClean === sMobileClean;

      return matchIdTag || matchUserId || matchUsername || matchMobile;
    });

    res.status(200).json({
      status: true,
      message: "Ok",
      total: userSessions.length,
      result: userSessions,
    });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: error.message || "Failed to fetch operator active sessions",
    });
  }
};
