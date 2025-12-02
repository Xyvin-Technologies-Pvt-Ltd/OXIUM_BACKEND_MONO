const crypto = require("crypto");

// Load private key from env
const PRIVATE_KEY = process.env.CONNECTIPS_PRIVATE_KEY.replace(/\\n/g, "\n");

// For PAYMENT INITIATION
exports.generatePaymentToken = (txnData) => {
  const tokenString = `MERCHANTID=${txnData.MERCHANTID},APPID=${txnData.APPID},APPNAME=${txnData.APPNAME},TXNID=${txnData.TXNID},TXNDATE=${txnData.TXNDATE},TXNCRNCY=${txnData.TXNCRNCY},TXNAMT=${txnData.TXNAMT},REFERENCEID=${txnData.REFERENCEID},REMARKS=${txnData.REMARKS},PARTICULARS=${txnData.PARTICULARS},TOKEN=TOKEN`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(tokenString);
  sign.end();

  return sign.sign(PRIVATE_KEY, "base64");
};

// For VALIDATION
exports.generateValidationToken = (merchantId, appId, txnId, txnAmt) => {
  const tokenString = `MERCHANTID=${merchantId},APPID=${appId},TXNID=${txnId},TXNAMT=${txnAmt}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(tokenString);
  sign.end();

  return sign.sign(PRIVATE_KEY, "base64");
};
