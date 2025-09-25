const paymentRoute = require("express").Router();
const paymentController = require('../../controllers/payment/paymentController');
const authVerify = require("../../middlewares/authVerify");
const asyncHandler = require("../../utils/asyncHandler");
const hblController = require("../../controllers/payment/hblController");

paymentRoute.post(
  "/payment/paymentOrder",
  authVerify,
  asyncHandler(paymentController.createPaymentOrder)
);

paymentRoute.post(
  "/payment/paymentVerify",
  authVerify,
  asyncHandler(paymentController.paymentVerify)
);

paymentRoute.get(
  "/payment/paymentVerify/v2",
  asyncHandler(paymentController.khaltiVerify)
);

//hbl
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
paymentRoute.post(
  "/payment/hbl/payment-callback",
  authVerify,
  asyncHandler(hblController.handlePaymentCallback) 
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
