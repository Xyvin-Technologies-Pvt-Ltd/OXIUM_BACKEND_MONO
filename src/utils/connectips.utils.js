const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

// PFX certificate
const pfxPath = path.join(__dirname, "../certs/CREDITOR.pfx");
const pfxPassword = "321"; // replace with actual

exports.generateToken = (txnData) => {
    const tokenString = `MERCHANTID=${txnData.MERCHANTID},APPID=${txnData.APPID},APPNAME=${txnData.APPNAME},TXNID=${txnData.TXNID},TXNDATE=${txnData.TXNDATE},TXNCRNCY=${txnData.TXNCRNCY},TXNAMT=${txnData.TXNAMT},REFERENCEID=${txnData.REFERENCEID},REMARKS=${txnData.REMARKS},PARTICULARS=${txnData.PARTICULARS},TOKEN=TOKEN`;

    const digest = crypto.createHash("sha256").update(tokenString).digest();

    const pfxBuffer = fs.readFileSync(pfxPath);
    const sign = crypto.createSign("RSA-SHA256");
    sign.update(digest);
    const signature = sign.sign({ pfx: pfxBuffer, passphrase: pfxPassword });

    return signature.toString("base64");
};
