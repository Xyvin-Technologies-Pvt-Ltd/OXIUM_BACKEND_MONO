const Transaction = require("../../models/Transaction");
const { generateToken } = require("../../utils/connectips.utils");
const axios = require("axios");

exports.initiatePayment = async (req, res) => {
  try {
    const { TXNAMT, REFERENCEID, REMARKS, PARTICULARS } = req.body;

    // Build transaction data
    const txnId = `TXN${Date.now()}`;
    const txnDate = new Date().toISOString().split("T")[0];

    const txnData = {
      MERCHANTID: process.env.CONNECTIPS_MERCHANT_ID,
      APPID: process.env.CONNECTIPS_APP_ID,
      APPNAME: process.env.CONNECTIPS_APP_NAME,
      TXNID: txnId,
      TXNDATE: txnDate,
      TXNCRNCY: "NPR",
      TXNAMT,
      REFERENCEID,
      REMARKS,
      PARTICULARS,
    };

    // Generate token
    txnData.TOKEN = generateToken(txnData);

    // Save transaction
    await Transaction.create({
      txnId,
      merchantId: txnData.MERCHANTID,
      appId: txnData.APPID,
      amount: TXNAMT,
      referenceId: REFERENCEID,
      status: "INITIATED",
    });

    // Respond back to frontend
    res.status(200).json({
      connectIPSUrl: process.env.CONNECTIPS_GATEWAY_URL,
      method: "POST",
      fields: txnData,
      successURL: process.env.SUCCESS_URL,
      failureURL: process.env.FAILURE_URL,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
};

exports.paymentCallback = async (req, res) => {
  try {
    const { TXNID } = req.body;

    const transaction = await Transaction.findOne({ txnId: TXNID });
    if (!transaction) return res.status(404).send("Transaction not found");

    const token = generateToken({
      MERCHANTID: transaction.merchantId,
      APPID: transaction.appId,
      REFERENCEID: transaction.referenceId, 
      TXNAMT: transaction.amount,
    });

    // Correct payload (uppercase keys)
    const validationData = {
      MERCHANTID: transaction.merchantId,
      APPID: transaction.appId,
      REFERENCEID: transaction.referenceId,
      TXNAMT: transaction.amount,
      TOKEN: token
    };
   
    const headers = {
      "Content-Type": "application/json",
      "Authorization":
        "Basic " + Buffer.from(`${process.env.CONNECTIPS_APP_ID}:${process.env.CONNECTIPS_BASIC_AUTH_PASSWORD}`).toString("base64"),
    };

    const validationRes = await axios.post(
      process.env.CONNECTIPS_VALIDATION_URL,
      validationData,
      { headers }
    );

    transaction.status =
      validationRes.data.status === "SUCCESS" ? "SUCCESS" : "FAILED";
    await transaction.save();

    res.status(200).json({
      message: "Transaction validated",
      txnId: transaction.txnId,
      status: transaction.status,
      validationResponse: validationRes.data,
    });
  } catch (err) {
    console.error("Validation Error:", err.response?.data || err.message);
    res.status(500).json({
      error: "Callback/Validation failed",
      details: err.response?.data || err.message,
    });
  }
};


