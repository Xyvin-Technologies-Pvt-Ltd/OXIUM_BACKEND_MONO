const Transaction = require("../../models/Transaction");
const { generateToken } = require("../../utils/connectips.utils");

exports.initiatePayment = async (req, res) => {
  try {
    const txnData = req.body;

    // Generate TXNID if not provided
    txnData.TXNID = txnData.TXNID || `TXN${Date.now()}`;
    txnData.TOKEN = generateToken(txnData);
    // txnData.TOKEN = "Txt Token "; // dummy data

    // Save transaction
    await Transaction.create({
      txnId: txnData.TXNID,
      merchantId: txnData.MERCHANTID,
      appId: txnData.APPID,
      amount: txnData.TXNAMT,
      referenceId: txnData.REFERENCEID,
      status: "INITIATED",
    });

    // Respond for mobile WebView
    res.status(200).json({
      connectIPSUrl: "https://uat.connectips.com/connectipswebgw/loginpage",
      method: "POST",
      fields: {
        MERCHANTID: txnData.MERCHANTID,
        APPID: txnData.APPID,
        APPNAME: txnData.APPNAME,
        TXNID: txnData.TXNID,
        TXNDATE: txnData.TXNDATE,
        TXNCRNCY: txnData.TXNCRNCY,
        TXNAMT: txnData.TXNAMT,
        REFERENCEID: txnData.REFERENCEID,
        REMARKS: txnData.REMARKS,
        PARTICULARS: txnData.PARTICULARS,
        TOKEN: txnData.TOKEN,
      },
      successURL: "https://yourapp.com/payment/connectips/success",
      failureURL: "https://yourapp.com/payment/connectips/failure",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to initiate payment" });
  }
};

exports.paymentCallback = async (req, res) => {
  try {
    const { TXNID, status } = req.body; // ConnectIPS sends TXNID parameter

    const transaction = await Transaction.findOne({ txnId: TXNID });
    if (!transaction) return res.status(404).send("Transaction not found");

    transaction.status = status === "SUCCESS" ? "SUCCESS" : "FAILED";
    await transaction.save();

    // Respond to ConnectIPS or mobile
    res.status(200).json({ message: "Transaction updated", txnId: TXNID, status: transaction.status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Callback failed" });
  }
};
