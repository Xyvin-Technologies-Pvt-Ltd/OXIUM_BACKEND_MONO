const axios = require("axios");

// Fallback if env vars are missing
const DEFAULT_AAKASH_SMS_AUTH_TOKEN = "cd4203e929421ba5906d7bb6f630ae503265ee2af713450e3fddf58c312f8a0f";
const DEFAULT_AAKASH_SMS_URL = "https://sms.aakashsms.com/sms/v3/send";

const normalizeNepalMobile = (phone) => {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("977") && digits.length > 10) {
    digits = digits.slice(3);
  }
  return digits;
};

const sendOTP = async ({ phone, otp }) => {
  const authToken = process.env.AAKASH_SMS_AUTH_TOKEN || DEFAULT_AAKASH_SMS_AUTH_TOKEN;
  const aakashSmsUrl = process.env.AAKASH_SMS_URL || DEFAULT_AAKASH_SMS_URL;

  const to = normalizeNepalMobile(phone);
  if (!to || to.length !== 10) {
    throw new Error("Invalid Nepal mobile number for AakashSMS");
  }

  const text = `Your GOEC APP OTP is ${otp}. Do not share this OTP with anyone.`;

  const response = await axios.post(aakashSmsUrl, {
    auth_token: authToken,
    to,
    text,
  });

  if (response.data?.error) {
    throw new Error(response.data.message || "AakashSMS failed to send OTP");
  }

  return { data: response.data, status: response.status };
};

module.exports = { sendOTP, normalizeNepalMobile };
