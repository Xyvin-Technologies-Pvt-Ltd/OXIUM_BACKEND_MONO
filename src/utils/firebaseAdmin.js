const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function initFirebaseAdmin() {
  if (admin.apps.length) {
    return { firebase: admin, configured: true };
  }

  let parsed;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (e) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON");
    }
  } else if (process.env.FIREBASE_CREDENTIAL_PATH) {
    const abs = path.isAbsolute(process.env.FIREBASE_CREDENTIAL_PATH)
      ? process.env.FIREBASE_CREDENTIAL_PATH
      : path.join(process.cwd(), process.env.FIREBASE_CREDENTIAL_PATH);
    if (!fs.existsSync(abs)) {
      console.warn(
        "[firebase] FIREBASE_CREDENTIAL_PATH file not found — push notifications disabled"
      );
      return { firebase: null, configured: false };
    }
    parsed = JSON.parse(fs.readFileSync(abs, "utf8"));
  } else {
    console.warn(
      "[firebase] Not configured — set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CREDENTIAL_PATH"
    );
    return { firebase: null, configured: false };
  }

  admin.initializeApp({
    credential: admin.credential.cert(parsed),
  });
  return { firebase: admin, configured: true };
}

module.exports = { initFirebaseAdmin };
