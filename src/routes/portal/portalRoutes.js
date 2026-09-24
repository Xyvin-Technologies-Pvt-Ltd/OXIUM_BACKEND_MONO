const portalRoute = require("express").Router();
const createError = require("http-errors");
const portalAuthController = require("../../controllers/portal/portalAuthController");
const portalReportController = require("../../controllers/portal/portalReportController");
const { portalAuth, requirePasswordChanged } = require("../../middlewares/portalAuth");
const asyncHandler = require("../../utils/asyncHandler");

// Station reports portal (foco). Uses its own auth (portalAuth), never CMS authVerify.

portalRoute.post("/auth/login", asyncHandler(portalAuthController.login));
portalRoute.post("/auth/refresh", asyncHandler(portalAuthController.refresh));
portalRoute.post("/auth/logout", asyncHandler(portalAuthController.logout));
portalRoute.post("/auth/forgot-password", asyncHandler(portalAuthController.forgotPassword));
portalRoute.post("/auth/reset-password", asyncHandler(portalAuthController.resetPassword));
portalRoute.post("/auth/change-password", portalAuth, asyncHandler(portalAuthController.changePassword));

portalRoute.get("/me", portalAuth, asyncHandler(portalAuthController.getMe));

// Reports: all scoped to the signed-in user's station (req.stationId)
const reportAuth = [portalAuth, requirePasswordChanged];
portalRoute.get("/overview", reportAuth, asyncHandler(portalReportController.getOverview));
portalRoute.get("/reports/charging-summary", reportAuth, asyncHandler(portalReportController.getChargingSummary));
portalRoute.get("/reports/transactions", reportAuth, asyncHandler(portalReportController.getTransactions));
portalRoute.get("/reports/finance", reportAuth, asyncHandler(portalReportController.getFinance));
portalRoute.get("/reports/:type/export", reportAuth, asyncHandler(portalReportController.exportReport));

// Keep unknown portal paths here instead of falling through to the CMS routers
portalRoute.all("*", (req, res, next) =>
  next(createError(404, `Cant find the ${req.originalUrl} on the OXIUM server !`))
);

module.exports = portalRoute;
