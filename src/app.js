require("dotenv").config({ override: false });
const express = require("express");
const cors = require("cors");
const logger = require("morgan");
const cookieParser = require("cookie-parser");
const volleyball = require("volleyball");
const createError = require("http-errors");
const helmet = require("helmet");
const mongoSanitize = require("express-mongo-sanitize");

const errorHandler = require("./middlewares/errorMiddleware.js");
const authVerify = require("./middlewares/authVerify.js");
const requestIdMiddleware = require("./middlewares/requestIdMiddleware.js");

const vehicleRoute = require("./routes/vehicle/vehicleRoutes.js");
const brandRoute = require("./routes/vehicle/brandRoutes.js");
const transactionRoute = require("./routes/transaction/transactionRoute.js");
const rfidRoute = require("./routes/rfid/rfidRoutes.js");
const reviewRoute = require("./routes/review/reviewRoutes.js");
const notificationRoute = require("./routes/notification/notificationRoutes.js");
const csRoute = require("./routes/chargingStation/chargingStationRoutes.js");
const evRoute = require("./routes/evMachine/evMachineRoutes.js");
const paymentRoute = require("./routes/payment/paymentRoutes.js");
const paymentWebhookRoutes = require("./routes/payment/paymentWebhook.routes.js");
const configRoute = require("./routes/configuration/configurationRoutes.js");
const logRoute = require("./routes/logs/logRoutes.js");
const adminRoute = require("./routes/user/adminRoutes.js");
const userRoute = require("./routes/user/userRoutes.js");
const connectipsRoute = require("./routes/payment-gateway/connectips.route");
const hblRoute = require("./routes/payment-gateway/hbl.route.js");

const app = express();

app.disable("x-powered-by");
app.use(requestIdMiddleware);
app.use(helmet());
app.use(
  mongoSanitize({
    replaceWith: "_",
  })
);

let corsParsed = process.env.CORS_ORIGIN;
if (typeof corsParsed === "string" && corsParsed.includes(",")) {
  corsParsed = corsParsed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

app.use(
  cors({
    origin: corsParsed,
    credentials: corsParsed !== "*",
  })
);

if (process.env.NODE_ENV !== "production") {
  app.use(volleyball);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health-check", (req, res) => {
  res.status(200).send("connected to oxium-service api!!!");
});

app.use(logger(process.env.NODE_ENV === "production" ? "combined" : "dev"));

const API_VERSION = process.env.API_VERSION ?? "v1";
const BASE_PATH = `/api/${API_VERSION}`;

app.get(BASE_PATH, (_req, res) =>
  res.status(200).send("All endpoints expect auth where noted.")
);

app.use(`${BASE_PATH}/admin`, adminRoute);

app.use(`${BASE_PATH}`, paymentWebhookRoutes);
app.use(`${BASE_PATH}`, connectipsRoute);
app.use(`${BASE_PATH}`, hblRoute);

app.use(`${BASE_PATH}`, userRoute);
app.use(`${BASE_PATH}`, authVerify, vehicleRoute);
app.use(`${BASE_PATH}`, authVerify, paymentRoute);
app.use(`${BASE_PATH}`, authVerify, brandRoute);
app.use(`${BASE_PATH}`, authVerify, transactionRoute);
app.use(`${BASE_PATH}`, authVerify, rfidRoute);
app.use(`${BASE_PATH}`, authVerify, reviewRoute);
app.use(`${BASE_PATH}`, authVerify, notificationRoute);
app.use(`${BASE_PATH}`, authVerify, csRoute);
app.use(`${BASE_PATH}`, authVerify, evRoute);
app.use(`${BASE_PATH}`, authVerify, configRoute);
app.use(`${BASE_PATH}`, authVerify, logRoute);

app.all("*", (req, res, next) => {
  next(
    new createError(
      404,
      `Cant find the ${req.originalUrl} on the OXIUM server !`
    )
  );
});
app.use(errorHandler);

module.exports = app;
