const reportRoute = require("express").Router();
const asyncHandler = require("../../utils/asyncHandler");
const reportController = require("../../controllers/reports/reportController");

reportRoute.get("/reports/view", asyncHandler(reportController.getReportView));

module.exports = reportRoute;
