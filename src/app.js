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
// const { runAllSeeds } = require("./seeds/index.js");
const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
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
