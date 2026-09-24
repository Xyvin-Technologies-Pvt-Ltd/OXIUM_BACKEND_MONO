require("dotenv").config();
const axios = require("axios");
const generateToken = require("../utils/generateToken");

exports.getSoC = async (cpid, connectorId) => {
  const ocppServiceUrl = process.env.OCPP_SERVICE_URL;
  if (!ocppServiceUrl) {
    console.error("OCPP_SERVICE_URL is not configured");
    return null;
  }

  const token = await generateToken(process.env.AUTH_SECRET);
  try {
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
    console.error("Error fetching SoC:", error.message);
    return null;
  }
};
