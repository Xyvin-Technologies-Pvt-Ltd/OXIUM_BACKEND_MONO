const express = require("express");
const router = express.Router();
const connectipsController = require("../../controllers/paymentgateway.controller/connectips.controller");

router.post("/payment/connectips/initiate", connectipsController.initiatePayment);
router.get("/payment/connectips/success", connectipsController.paymentSuccess);
router.get("/payment/connectips/failure", connectipsController.paymentFailure);


module.exports = router;
