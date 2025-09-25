const connectipsRoute = require("express").Router();
const connectIpsController = require("../../controllers/connectIpsController");

// Payment initiation
connectipsRoute.post("/initiate", connectIpsController.initiatePayment);

// Payment callbacks
connectipsRoute.get("/success", connectIpsController.handleSuccess);
connectipsRoute.get("/failure", connectIpsController.handleFailure);

// Payment verification
connectipsRoute.post("/verify/:txnId", connectIpsController.verifyPayment);
connectipsRoute.get("/status/:txnId", connectIpsController.getPaymentStatus);

module.exports = connectipsRoute;
