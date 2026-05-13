const { initFirebaseAdmin } = require("../utils/firebaseAdmin");
const { firebase } = initFirebaseAdmin();

module.exports = { firebase };
