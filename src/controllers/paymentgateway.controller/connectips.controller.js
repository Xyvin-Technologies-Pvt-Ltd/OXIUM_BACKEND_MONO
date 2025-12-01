const Transaction = require("../../models/Transaction");
const WalletTransaction = require("../../models/walletTransactionSchema");
const User = require("../../models/userSchema");
const { generatePaymentToken, generateValidationToken } = require("../../utils/connectips.utils");
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

    // Convert rupees → paisa
    const amountInRupees = parseInt(TXNAMT);
    const amountInPaisa = amountInRupees * 100;

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

    const txnId = `TXN${Date.now()}`;
    const referenceId = `REF${Date.now()}`;
    
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    const txnDate = `${day}-${month}-${year}`;

    const txnData = {
      MERCHANTID: process.env.CONNECTIPS_MERCHANT_ID,
      APPID: process.env.CONNECTIPS_APP_ID,
      APPNAME: "GO E. C. Mercantile Pvt Ltd",
      TXNID: txnId,
      TXNDATE: txnDate,
      TXNCRNCY: "NPR",
      TXNAMT: amountInPaisa,
      REFERENCEID: referenceId,
      REMARKS: REMARKS || "Payment",
      PARTICULARS: PARTICULARS || "General Payment",
    };

    txnData.TOKEN = generatePaymentToken(txnData);

    // FIXED: Store amount in rupees, not paisa
    await Transaction.create({
      txnId,
      merchantId: txnData.MERCHANTID,
      appId: txnData.APPID,
      amount: amountInRupees, // Store in rupees for wallet update
      amountInPaisa: amountInPaisa, // Store paisa for ConnectIPS validation
      referenceId,
      status: "INITIATED",
      userId: userId,
    });

    res.status(200).json({
      success: true,
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
    const TXNID = req.query.TXNID;
    if (!TXNID) {
      return res.redirect(`${process.env.FRONTEND_URL}/payment-failed`);
    }

    const validationResult = await validateTransaction(TXNID);

    if (validationResult.status === "SUCCESS") {
      const transaction = await Transaction.findOne({ txnId: TXNID });
      if (transaction && transaction.userId) {
        const customUserId = transaction.userId;
        
        // FIXED: Use amount in rupees (not paisa)
        const amountInRupees = transaction.amount;
        
        const user = await User.findOne({ userId: customUserId });
        if (user) {
          // Check if already processed
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
  try {
    const TXNID = req.query.TXNID;
    if (TXNID) {
      // Mark transaction as failed
      await Transaction.findOneAndUpdate(
        { txnId: TXNID },
        { status: "FAILED" }
      );
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

  // FIXED: Use amountInPaisa for validation (not transaction.amount)
  const amountForValidation = transaction.amountInPaisa || (transaction.amount * 100);
  
  const token = generateValidationToken(
    transaction.merchantId,
    transaction.appId,
    transaction.txnId,
    amountForValidation // Use paisa amount
  );

  const validationData = {
    merchantId: transaction.merchantId,
    appId: transaction.appId,
    referenceId: transaction.txnId,
    txnAmt: amountForValidation.toString(), // Use paisa
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