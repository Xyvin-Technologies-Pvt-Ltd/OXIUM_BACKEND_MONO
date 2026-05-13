const { firebase } = require("../config/firebaseInit");

async function sendPushNotification(deviceToken, payload) {
  if (!firebase) throw new Error("Firebase not configured");
  const message = {
    ...payload,
    token: deviceToken,
  };
  return firebase.messaging().send(message);
}

async function sendPushNotificationToAll(payload) {
  if (!firebase) throw new Error("Firebase not configured");
  const topic = "general";
  return firebase.messaging().send({
    topic,
    notification: payload,
    data: { startCharge: "false" },
  });
}

module.exports = { sendPushNotificationToAll, sendPushNotification };
