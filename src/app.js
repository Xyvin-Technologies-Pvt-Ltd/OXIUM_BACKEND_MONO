require("dotenv").config();
const express = require("express");
const cors = require("cors");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const volleyball = require("volleyball");
const createError = require("http-errors");
const errorHandler = require("./middlewares/errorMiddleware.js");
const vehicleRoute = require("./routes/vehicle/vehicleRoutes.js");
const authVerify = require("./middlewares/authVerify.js");
const brandRoute = require("./routes/vehicle/brandRoutes.js");
const transactionRoute = require("./routes/transaction/transactionRoute.js");
const rfidRoute = require("./routes/rfid/rfidRoutes.js");
const reviewRoute = require("./routes/review/reviewRoutes.js");
const notificationRoute = require("./routes/notification/notificationRoutes.js");
const csRoute = require("./routes/chargingStation/chargingStationRoutes.js");
const evRoute = require("./routes/evMachine/evMachineRoutes.js");
const paymentRoute = require("./routes/payment/paymentRoutes.js");
const configRoute = require("./routes/configuration/configurationRoutes.js");
const logRoute = require("./routes/logs/logRoutes.js");
const adminRoute = require("./routes/user/adminRoutes.js");
const userRoute = require("./routes/user/userRoutes.js");
const connectipsRoute = require("./routes/payment-gateway/connectips.route");
const hblRoute = require('./routes/payment-gateway/hbl.route.js');
const reportRoute = require("./routes/reports/reportRoutes.js");
const operatorRoute = require("./routes/operator/operatorRoutes.js");
const portalRoute = require("./routes/portal/portalRoutes.js");
// const { runAllSeeds } = require("./seeds/index.js");
const app = express();

// CORS_ORIGIN may list several origins separated by commas (CMS + station portal).
// A single value, including "*", is passed through unchanged.
const corsOrigin =
  process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.includes(",")
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
    : process.env.CORS_ORIGIN;

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    // Lets the portal read the export file name
    exposedHeaders: ["Content-Disposition"],
  })
);
app.use(volleyball);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

//! DONOT DELETE
app.get("/api/health-check", (req, res) => {
  res.status(200).send("connected to oxium-service api!!!");
});

app.use(logger("dev"));

// Define the API version based on environment variable
const { API_VERSION } = process.env || "v1";
// Set the base path for API routes
const BASE_PATH = `/api/${API_VERSION}`;

app.get(BASE_PATH, (req, res) =>
  res.status(200).send(" All endpoints are 🔐. Do you have the 🔑")
);
// runAllSeeds();

app.use(`${BASE_PATH}/admin`, adminRoute);
// Must stay above the `${BASE_PATH}` + authVerify mounts: those run CMS auth on every
// request under BASE_PATH that reaches them, which would reject portal tokens.
app.use(`${BASE_PATH}/portal`, portalRoute);
app.use(`${BASE_PATH}`, connectipsRoute);
app.use(`${BASE_PATH}`, hblRoute);
app.use(`${BASE_PATH}`, userRoute);
app.use(`${BASE_PATH}`, authVerify, vehicleRoute);
app.use(`${BASE_PATH}`, authVerify, brandRoute);
app.use(`${BASE_PATH}`, authVerify, transactionRoute);
app.use(`${BASE_PATH}`, authVerify, rfidRoute);
app.use(`${BASE_PATH}`, authVerify, reviewRoute);
app.use(`${BASE_PATH}`, authVerify, notificationRoute);
app.use(`${BASE_PATH}`, authVerify, csRoute);
app.use(`${BASE_PATH}`, authVerify, evRoute);
app.use(`${BASE_PATH}`, authVerify, paymentRoute);
app.use(`${BASE_PATH}`, authVerify, configRoute);
app.use(`${BASE_PATH}`, authVerify, logRoute);
app.use(`${BASE_PATH}`, authVerify, reportRoute);
app.use(`${BASE_PATH}`, authVerify, operatorRoute);



// 404
app.all("*", (req, res, next) => {
  const err = new createError(
    404,
    `Cant find the ${req.originalUrl} on the OXIUM server !`
  );
  next(err);
});
app.use(errorHandler);

// Export the Express app for use in the handler.js file
module.exports = app;