const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

const keyPath = path.join(__dirname, "../certs/CREDITOR-key.pem");

exports.generateToken = (txnData) => {
  const tokenString = `MERCHANTID=${txnData.MERCHANTID},APPID=${txnData.APPID},APPNAME=${txnData.APPNAME},TXNID=${txnData.TXNID},TXNDATE=${txnData.TXNDATE},TXNCRNCY=${txnData.TXNCRNCY},TXNAMT=${txnData.TXNAMT},REFERENCEID=${txnData.REFERENCEID},REMARKS=${txnData.REMARKS},PARTICULARS=${txnData.PARTICULARS},TOKEN=TOKEN`;

  const privateKey = fs.readFileSync(keyPath, "utf8");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(tokenString);
  sign.end();

  const signature = sign.sign(privateKey, "base64");
  return signature;
};
