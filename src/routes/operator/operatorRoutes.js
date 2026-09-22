const operatorRoute = require("express").Router();
const operatorController = require("../../controllers/operator/operatorController");
const asyncHandler = require("../../utils/asyncHandler");

// 1. Get All Stations, Chargers, and Real Connectors in a single optimized call
operatorRoute.get("/operator/stations", asyncHandler(operatorController.getOperatorStations));

// 2. Get Operator Profile and Wallet info
operatorRoute.get("/operator/profile", asyncHandler(operatorController.getOperatorProfile));

// 3. Get Active Sessions Initiated by Operator
operatorRoute.get("/operator/activeSessions", asyncHandler(operatorController.getOperatorActiveSessions));

module.exports = operatorRoute;
