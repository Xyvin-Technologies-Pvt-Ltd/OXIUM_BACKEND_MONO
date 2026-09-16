const smsClient = require("../../helpers/smsClient.js");
const { sendTwilioOTP } = require("../../helpers/twilioClient.js");

// send sms notification
exports.sendSms = async (req, res, internalCall = false) => {
  let { phoneNumber, otp } = req.body;
  const countryCode = "+977"; // Country code for Nepal
  let result;
  if (phoneNumber.startsWith(countryCode)) {
    const user = {
      phone: phoneNumber.substring(countryCode.length), // Remove countryCode and non-digit characters
      otp: otp,
    };

    result = await smsClient.sendOTP(user);
  } else {
    result = await sendTwilioOTP(phoneNumber, otp);
  }
  if (internalCall === true) return;
  res.status(200).json({ status: true, message: "OTP sent successfully" });
};
