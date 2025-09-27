const Transaction = require("../../models/Transaction");
const { generateToken } = require("../../utils/connectips.utils");
const axios = require("axios");

exports.initiatePayment = async (req, res) => {
  try {
    const { TXNAMT, REMARKS, PARTICULARS } = req.body;

    const txnId = `TXN${Date.now()}`;
    const referenceId = `REF${Date.now()}`;
    const txnDate = new Date().toISOString().split("T")[0];

    const txnData = {
      MERCHANTID: process.env.CONNECTIPS_MERCHANT_ID,
      APPID: process.env.CONNECTIPS_APP_ID,
      APPNAME: process.env.CONNECTIPS_APP_NAME,
      TXNID: txnId,
      TXNDATE: txnDate,
      TXNCRNCY: "NPR",
      TXNAMT,
      REFERENCEID : referenceId,
      REMARKS,
      PARTICULARS,
    };

    // Generate token
    txnData.TOKEN = generateToken(txnData);

    await Transaction.create({
      txnId,
      merchantId: txnData.MERCHANTID,
      appId: txnData.APPID,
      amount: TXNAMT,
      referenceId,
      status: "INITIATED",
    });

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


exports.paymentSuccess = async (req, res) => {
  try {
    const TXNID = req.query.TXNID; // ConnectIPS sends transaction ID in query param
    if (!TXNID) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
    }

    const validationResult = await validateTransaction(TXNID);

    if (validationResult.status === "SUCCESS") {
      // Add wallet top-up / order confirmation logic
      return res.redirect(`${process.env.FRONTEND_URL}/payment-success?txnId=${TXNID}`);
    } else {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed?txnId=${TXNID}`);
    }
  } catch (err) {
    console.error("Payment Success Handler Error:", err.message);
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
  }
};

exports.paymentFailure = async (req, res) => {
  console.log("paymentFailure called");
  
  try {
    const TXNID = req.query.TXNID;

    if (TXNID) {
      await validateTransaction(TXNID); 
    }

    res.redirect(`${process.env.FRONTEND_URL}/payment-failed?txnId=${TXNID || ""}`);
  } catch (err) {
    console.error("Payment Failure Handler Error:", err.message);
    res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
  }
};


const validateTransaction = async (TXNID) => {
  const transaction = await Transaction.findOne({ txnId: TXNID });
  if (!transaction) throw new Error("Transaction not found");

  const token = generateToken({
    MERCHANTID: transaction.merchantId,
    APPID: transaction.appId,
    REFERENCEID: transaction.referenceId,
    TXNAMT: transaction.amount,
  });

  const validationData = {
    MERCHANTID: transaction.merchantId,
    APPID: transaction.appId,
    REFERENCEID: transaction.referenceId,
    TXNAMT: transaction.amount,
    TOKEN: token,
  };

  const headers = {
    "Content-Type": "application/json",
    "Authorization":
      "Basic " +
      Buffer.from(
        `${process.env.CONNECTIPS_APP_ID}:${process.env.CONNECTIPS_BASIC_AUTH_PASSWORD}`
      ).toString("base64"),
  };

  const validationRes = await axios.post(
    process.env.CONNECTIPS_VALIDATION_URL,
    validationData,
    { headers }
  );

  // Update transaction in DB
  transaction.status =
    validationRes.data.status === "SUCCESS" ? "SUCCESS" : "FAILED";
  await transaction.save();

  return validationRes.data;
};

