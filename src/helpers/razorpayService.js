const Razorpay = require("razorpay");
const createError = require("http-errors");
const generateUniqueReceiptID = require("../utils/generateUniqueID");

exports.createRazorPaymentOrder = async (amount, currency) => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_SECRET_KEY;

  if (!key_id || !key_secret) {
    throw createError(503, "Razorpay keys not configured");
  }

  try {
    const instance = new Razorpay({
      key_id,
      key_secret,
    });

    const options = {
      amount: Number(amount) * 100,
      currency,
      receipt: generateUniqueReceiptID(),
    };

    const order = await instance.orders.create(options);

    if (order.error) {
      throw order.error;
    }
    return order;
  } catch (error) {
    console.warn("[razorpay]", error.message || error);
    throw createError(400, "Bad request - Payment Gateway");
  }
};
