require("dotenv").config();
const axios = require("axios");
const generateToken = require("../utils/generateToken");

const staticGlobalUrl = "http://13.203.2.34:6500";



exports.getSoC = async (cpid, connectorId) => {
  const token = await generateToken(process.env.AUTH_SECRET);
  try {
    let ocppServiceUrl = process.env.OCPP_SERVICE_URL;
    if (!ocppServiceUrl) ocppServiceUrl = staticGlobalUrl;
    const response = await axios.get(
      `${ocppServiceUrl}/api/v1/ocpp/getOcpp/${cpid}/${connectorId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data.result;
  } catch (error) {
    console.error("Error fetching rating:", error);
    return null;
  }
};
