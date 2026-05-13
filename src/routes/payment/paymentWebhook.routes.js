/**
 * Callback / redirect routes — must NOT sit behind JWT auth middleware.
 */
const paymentRoute = require("express").Router();
const asyncHandler = require("../../utils/asyncHandler");
const paymentController = require("../../controllers/payment/paymentController");
const paymentWebhookAuth = require("../../middlewares/paymentWebhookAuth");
const hblController = require("../../controllers/payment/hblController");

paymentRoute.post(
  "/payment/hbl/payment-callback",
  paymentWebhookAuth,
  asyncHandler(hblController.handlePaymentCallback)
);

paymentRoute.get(
  "/payment/paymentVerify/v2",
  asyncHandler(paymentController.khaltiVerify)
);

module.exports = paymentRoute;
