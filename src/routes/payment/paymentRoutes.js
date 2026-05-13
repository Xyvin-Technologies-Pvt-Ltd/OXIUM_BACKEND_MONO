const paymentRoute = require("express").Router();
const paymentController = require("../../controllers/payment/paymentController");
const authVerify = require("../../middlewares/authVerify");
const asyncHandler = require("../../utils/asyncHandler");
const hblController = require("../../controllers/payment/hblController");
const { paymentLimiter } = require("../../middlewares/rateLimiters");

paymentRoute.post(
  "/payment/paymentOrder",
  authVerify,
  paymentLimiter,
  asyncHandler(paymentController.createPaymentOrder)
);

paymentRoute.post(
  "/payment/paymentVerify",
  authVerify,
  paymentLimiter,
  asyncHandler(paymentController.paymentVerify)
);

paymentRoute.post(
  "/payment/hbl/create-payment",
  authVerify,
  asyncHandler(hblController.createPayment)
);

paymentRoute.get(
  "/payment/hbl/verify-payment/:transactionRef",
  authVerify,
  asyncHandler(hblController.verifyPayment)
);
paymentRoute.get(
  "/payment/hbl/payment-success",
  authVerify,
  asyncHandler(hblController.handlePaymentSuccess)
);
paymentRoute.get(
  "/payment/hbl/payment-cancel",
  authVerify,
  asyncHandler(hblController.handlePaymentCancel)
);

module.exports = paymentRoute;
