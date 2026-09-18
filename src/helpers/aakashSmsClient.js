const axios = require("axios");

const normalizeNepalMobile = (phone) => {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (digits.startsWith("977") && digits.length > 10) {
    digits = digits.slice(3);
  }
  return digits;
};

const sendOTP = async ({ phone, otp }) => {
  const authToken = process.env.AAKASH_SMS_AUTH_TOKEN;
  const aakashSmsUrl = process.env.AAKASH_SMS_URL;
  if (!authToken) {
    throw new Error("AAKASH_SMS_AUTH_TOKEN is not configured");
  }
  if (!aakashSmsUrl) {
    throw new Error("AAKASH_SMS_URL is not configured");
  }

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
