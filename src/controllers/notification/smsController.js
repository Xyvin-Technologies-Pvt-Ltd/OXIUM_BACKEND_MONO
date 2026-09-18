const aakashSmsClient = require("../../helpers/aakashSmsClient.js");
const { sendTwilioOTP } = require("../../helpers/twilioClient.js");

// send sms notification
exports.sendSms = async (req, res, internalCall = false) => {
  let { phoneNumber, otp } = req.body;
  const countryCode = "+977"; // Country code for Nepal
  let result;

  // Nepal numbers -> AakashSMS; others -> Twilio
  if (
    phoneNumber.startsWith(countryCode) ||
    phoneNumber.startsWith("977") ||
    (!phoneNumber.startsWith("+") && String(phoneNumber).replace(/\D/g, "").length === 10)
  ) {
    result = await aakashSmsClient.sendOTP({
      phone: phoneNumber,
      otp,
    });
  } else {
    result = await sendTwilioOTP(phoneNumber, otp);
  }

  if (internalCall === true) return result;
  res.status(200).json({ status: true, message: "OTP sent successfully" });
};
