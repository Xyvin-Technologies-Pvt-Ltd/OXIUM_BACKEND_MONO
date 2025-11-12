const express = require("express");
const router = express.Router();
const connectipsController = require("../../controllers/paymentgateway.controller/connectips.controller");

router.post("/payment/connectips/initiate", connectipsController.initiatePayment);
router.get("/payment/connectips/success", connectipsController.paymentSuccess);
router.get("/payment/connectips/failure", connectipsController.paymentFailure);

// const connectipsRoute = require("express").Router();
// const connectIpsController = require("../../controllers/connectIpsController");

// Payment initiation
// connectipsRoute.post("/initiate", connectIpsController.initiatePayment);

module.exports = router;
// Payment callbacks
// connectipsRoute.get("/success", connectIpsController.handleSuccess);
// connectipsRoute.get("/failure", connectIpsController.handleFailure);

// Payment verification
// connectipsRoute.post("/verify/:txnId", connectIpsController.verifyPayment);
// connectipsRoute.get("/status/:txnId", connectIpsController.getPaymentStatus);

// module.exports = connectipsRoute;
