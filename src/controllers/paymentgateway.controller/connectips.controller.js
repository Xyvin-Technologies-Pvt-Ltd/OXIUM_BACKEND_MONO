const Transaction = require("../../models/Transaction");
const WalletTransaction = require("../../models/walletTransactionSchema");
const User = require("../../models/userSchema");
const { generatePaymentToken, generateValidationToken } = require("../../utils/connectips.utils");
const crypto = require("crypto");
const axios = require("axios");

exports.initiatePayment = async (req, res) => {
  try {
    const { TXNAMT, REMARKS, PARTICULARS, userId } = req.body;

    if (!TXNAMT) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const user = await User.findOne({ userId: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Convert rupees → paisa
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
      amount: amountInRupees, // Store in rupees for wallet update
      amountInPaisa: amountInPaisa, // Store paisa for ConnectIPS validation
      referenceId : txnId,
      status: "INITIATED",
      userId: userId,
    });

    res.status(200).json({
      success: true,
      connectIPSUrl: process.env.CONNECTIPS_GATEWAY_URL,
      method: "POST",
      fields: txnData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
};

exports.paymentSuccess = async (req, res) => {
  try {
    const TXNID = req.query.TXNID;
    if (!TXNID) {
      return res.json({ success: false, message: "Transaction ID missing" });
    }

    const validationResult = await validateTransaction(TXNID);

    if (validationResult.status === "SUCCESS") {
      const transaction = await Transaction.findOne({ txnId: TXNID });
      if (transaction && transaction.userId) {
        const customUserId = transaction.userId;

        const amountInRupees = transaction.amount;

        const user = await User.findOne({ userId: customUserId });
        if (user) {
          const existingTx = await WalletTransaction.findOne({
            transactionId: TXNID,
            status: 'success'
          });

          if (!existingTx) {
            await WalletTransaction.create({
              user: user._id,
              amount: amountInRupees, // Use rupees
              type: 'wallet top-up',
              status: 'success',
              transactionId: TXNID,
              currency: 'NPR',
              external_payment_ref: transaction.referenceId,
              paymentId: transaction.referenceId,
              reference: 'ConnectIPS Payment Gateway',
              userWalletUpdated: true
            });

            await User.findOneAndUpdate(
              { userId: customUserId },
              { $inc: { wallet: amountInRupees } }, // Add rupees to wallet
              { new: true }
            );
          }
        }
      }

      return res.json({ success: true, status: "SUCCESS", txnId: TXNID });
    } else {
      res.json({ success: false, status: "FAILED", txnId: TXNID });
    }
  } catch (err) {
    console.error("Payment Success Handler Error:", err.message);
    res.json({ success: false, status: "FAILED" });
  }
};

exports.paymentFailure = async (req, res) => {
  try {
    const TXNID = req.query.TXNID;
    if (TXNID) {
      await Transaction.findOneAndUpdate(
        { txnId: TXNID },
        { status: "FAILED" }
      );
    }

    res.json({ success: false, status: "FAILED", txnId: TXNID });
  } catch (err) {
    console.error("Payment Failure Handler Error:", err.message);
    res.json({ success: false, status: "FAILED" });
  }
};

const validateTransaction = async (TXNID) => {
  const transaction = await Transaction.findOne({ txnId: TXNID });
  if (!transaction) throw new Error("Transaction not found");

  const amountForValidation = transaction.amountInPaisa || (transaction.amount * 100);

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
    "Authorization": "Basic " + Buffer.from(`${process.env.CONNECTIPS_APP_ID}:${process.env.CONNECTIPS_BASIC_AUTH_PASSWORD}`).toString("base64"),
  };

  const validationRes = await axios.post(
    process.env.CONNECTIPS_VALIDATION_URL,
    validationData,
    { headers }
  );

  transaction.status = validationRes.data.status === "SUCCESS" ? "SUCCESS" : "FAILED";
  await transaction.save();

  return validationRes.data;
};


exports.checkPaymentStatus = async (req, res) => {
  try {
    const { txnId } = req.params;

    const txn = await Transaction.findOne({ txnId });
    if (!txn) {
      return res.json({ status: "NOT_FOUND" });
    }

    res.json({
      status: txn.status,
      userId: txn.userId,
      amount: txn.amount,
    });
  } catch (error) {
    res.json({ status: "ERROR" });
  }
};