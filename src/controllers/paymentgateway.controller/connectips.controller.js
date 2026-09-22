const Transaction = require("../../models/Transaction");
const WalletTransaction = require("../../models/walletTransactionSchema");
const User = require("../../models/userSchema");
const { generatePaymentToken, generateValidationToken } = require("../../utils/connectips.utils");
const crypto = require("crypto");
const axios = require("axios");

const validateTransaction = async (TXNID) => {
  const transaction = await Transaction.findOne({ txnId: TXNID });
  if (!transaction) throw new Error("Transaction not found");

  const amountForValidation = transaction.amountInPaisa || transaction.amount * 100;

  const token = generateValidationToken(
    transaction.merchantId,
    transaction.appId,
    TXNID,
    amountForValidation
  );

  const validationData = {
    merchantId: transaction.merchantId,
    appId: transaction.appId,
    referenceId: TXNID,
    txnAmt: amountForValidation.toString(),
    token: token,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization:
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

  const status = validationRes.data.status;
  if (status === "SUCCESS") {
    transaction.status = "SUCCESS";
  } else if (status === "FAILED") {
    transaction.status = "FAILED";
  }
  await transaction.save();

  return validationRes.data;
};

exports.initiatePayment = async (req, res) => {
  try {
    const { TXNAMT, REMARKS, PARTICULARS, userId } = req.body;

    if (!TXNAMT) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const user = await User.findOne({ userId: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const amountInRupees = parseInt(TXNAMT);
    const amountInPaisa = amountInRupees * 100;

    const txnId = "TXN" + crypto.randomBytes(6).toString("hex").toUpperCase();

    const now = new Date();
    const txnDate = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;

    const txnData = {
      MERCHANTID: process.env.CONNECTIPS_MERCHANT_ID,
      APPID: process.env.CONNECTIPS_APP_ID,
      APPNAME: "GO E. C. Mercantile Pvt Ltd",
      TXNID: txnId,
      TXNDATE: txnDate,
      TXNCRNCY: "NPR",
      TXNAMT: amountInPaisa,
      REFERENCEID: txnId,
      REMARKS: REMARKS || "Payment",
      PARTICULARS: PARTICULARS || "General Payment",
    };

    txnData.TOKEN = generatePaymentToken(txnData);

    await Transaction.create({
      txnId,
      merchantId: txnData.MERCHANTID,
      appId: txnData.APPID,
      amount: amountInRupees,
      amountInPaisa: amountInPaisa,
      referenceId: txnId,
      status: "INITIATED",
      userId: userId,
    });

    res.status(200).json({
      success: true,
      txnId,
      connectIPSUrl: process.env.CONNECTIPS_GATEWAY_URL,
      method: "POST",
      fields: txnData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to initiate payment",
    });
  }
};

exports.paymentSuccess = async (req, res) => {
  try {
    const TXNID = req.query.TXNID;
    if (!TXNID) {
      return res.status(400).json({
        success: false,
        message: "TXNID is required",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Payment redirect received. Call verify API to confirm status.",
      txnId: TXNID,
    });
  } catch (err) {
    console.error("Payment Success Handler Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.paymentFailure = async (req, res) => {
  try {
    const TXNID = req.query.TXNID;

    return res.status(200).json({
      success: false,
      message: "Payment cancelled/failed redirect received. Call verify API to confirm status.",
      txnId: TXNID || null,
    });
  } catch (err) {
    console.error("Payment Failure Handler Error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

exports.verifyPayment = async (req, res) => {
  try {
    const { txnId } = req.params;

    if (!txnId) {
      return res.status(400).json({
        success: false,
        status: "FAILED",
        message: "Transaction ID is required",
      });
    }

    const existing = await Transaction.findOne({ txnId });
    if (!existing) {
      return res.status(404).json({
        success: false,
        status: "NOT_FOUND",
        message: "Transaction not found",
      });
    }

    if (existing.status === "FAILED") {
      return res.status(200).json({
        success: false,
        status: "FAILED",
        txnId,
        amount: existing.amount,
        userId: existing.userId,
      });
    }

    let statusDesc = null;

    if (existing.status !== "SUCCESS") {
      const validationResult = await validateTransaction(txnId);
      statusDesc = validationResult.statusDesc || null;

      if (validationResult.status !== "SUCCESS") {
        return res.status(200).json({
          success: false,
          status: validationResult.status || "FAILED",
          txnId,
          amount: existing.amount,
          userId: existing.userId,
          statusDesc,
        });
      }
    }

    let wallet = { credited: false, alreadyCredited: false };
    const existingTx = await WalletTransaction.findOne({
      transactionId: txnId,
      status: "success",
    });

    if (existingTx) {
      wallet = {
        credited: false,
        alreadyCredited: true,
        amount: existing.amount,
        userId: existing.userId,
      };
    } else {
      const user = await User.findOne({ userId: existing.userId });
      if (!user) {
        return res.status(404).json({
          success: false,
          status: "ERROR",
          message: "User not found",
          txnId,
        });
      }

      await WalletTransaction.create({
        user: user._id,
        amount: existing.amount,
        type: "wallet top-up",
        status: "success",
        transactionId: txnId,
        currency: "NPR",
        external_payment_ref: existing.referenceId,
        paymentId: existing.referenceId,
        reference: "ConnectIPS Payment Gateway",
        userWalletUpdated: true,
      });

      await User.findOneAndUpdate(
        { userId: existing.userId },
        { $inc: { wallet: existing.amount } },
        { new: true }
      );

      wallet = {
        credited: true,
        amount: existing.amount,
        userId: existing.userId,
      };
    }

    return res.status(200).json({
      success: true,
      status: "SUCCESS",
      txnId,
      amount: existing.amount,
      userId: existing.userId,
      wallet,
      statusDesc,
    });
  } catch (err) {
    console.error("ConnectIPS verify error:", err.message);
    return res.status(500).json({
      success: false,
      status: "ERROR",
      message: err.message || "Failed to verify payment",
    });
  }
};

exports.checkPaymentStatus = async (req, res) => {
  try {
    const { txnId } = req.params;

    const txn = await Transaction.findOne({ txnId });
    if (!txn) {
      return res.json({
        success: false,
        status: "NOT_FOUND",
      });
    }

    res.json({
      success: txn.status === "SUCCESS",
      status: txn.status,
      txnId: txn.txnId,
      userId: txn.userId,
      amount: txn.amount,
    });
  } catch (error) {
    res.json({
      success: false,
      status: "ERROR",
    });
  }
};
