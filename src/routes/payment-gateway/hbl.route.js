const express = require("express");
const router = express.Router();
const hblController = require("../../controllers/paymentgateway.controller/hbl.controller");

// HBL Payment routes
router.post("/payment/hbl/generate-page", hblController.generateHblPaymentPage);

// HBL Callbacks - Support BOTH POST and GET
router.post("/payment/hbl/success", hblController.hblPaymentSuccess); // ← ADD POST
router.get("/payment/hbl/success", hblController.hblPaymentSuccess); 

router.post("/payment/hbl/failure", hblController.hblPaymentFailure); // ← ADD POST  
router.get("/payment/hbl/failure", hblController.hblPaymentFailure); 

// HBL Webhook
router.post("/payment/hbl/webhook", hblController.hblWebhook);

// HBL Transaction status
router.get("/payment/hbl/status/:transactionId", hblController.checkHblTransactionStatus);

module.exports = router;