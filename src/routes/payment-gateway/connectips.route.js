const express = require("express");
const router = express.Router();
const connectipsController = require("../../controllers/paymentgateway.controller.js/connectips.controller");

// Initiate payment (mobile calls this)
router.post("/payment/connectips/initiate", connectipsController.initiatePayment);

// Callback endpoint for ConnectIPS (success/failure)
router.post("/payment/connectips/callback", connectipsController.paymentCallback);

module.exports = router;
