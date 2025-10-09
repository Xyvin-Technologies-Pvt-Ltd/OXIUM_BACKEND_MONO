const express = require("express");
const router = express.Router();
const hblController = require("../../controllers/paymentgateway.controller/hbl.controller");

// HBL Payment
router.post("/payment/hbl/generate-page", hblController.generateHblPaymentPage);

// HBL Callbacks=
router.get("/payment/hbl/success", hblController.hblPaymentSuccess); 
router.get("/payment/hbl/failure", hblController.hblPaymentFailure); 

// HBL Webhook : This endpoint requires configuration in HBL merchant portal
router.post("/payment/hbl/webhook", hblController.hblWebhook);

// HBL Transaction status
router.get("/payment/hbl/status/:transactionId", hblController.checkHblTransactionStatus);

module.exports = router;