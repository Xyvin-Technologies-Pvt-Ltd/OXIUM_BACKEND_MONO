require("dotenv").config();
const { khaltiService, khaltiCallback } = require("khalti-payment");
const crypto = require("crypto");
const { KHALTI_GATEWAY_URL, KHALTI_SECRET_KEY, KHALTI_RETURN_URL } =
  process.env;
const { createRazorPaymentOrder } = require("../../helpers/razorpayService");
const {
  updateWalletTransaction,
  createWalletTransaction,
} = require("../transaction/transactionController");

exports.createPaymentOrder = async (req, res) => {
  const { amount, currency, userId, type } = req.body;
  if (!userId) throw new createError(400, "UserId required for payment order");

  const paymentGateway = "Razorpay";
  let order;
  if (paymentGateway === "Razorpay") {
    order = await createRazorPaymentOrder(amount, currency);
  } else {
    const payload = {
      return_url: KHALTI_RETURN_URL,
      website_url: "https://example.com/",
      amount: amount * 100,
      purchase_order_id: "test12",
      purchase_order_name: `wallet_${userId}`,
    };

    const config = {
      KHALTI_GATEWAY_URL,
      KHALTI_SECRET_KEY,
    };

    order = await khaltiService(payload, config);
  }
  const payload = {
    user: userId,
    amount: amount,
    type: type || "wallet top-up",
    currency: currency,
    transactionId: order.id,
  };
  req.body = payload;
  await createWalletTransaction(req, res, true);

  //create new transaction wallet
  res.status(200).json({ status: true, result: order });
};

exports.paymentVerify = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_SECRET_KEY)
    .update(sign.toString())
    .digest("hex");

  const payload = {
    status: razorpay_signature === expectedSign ? "success" : "failure",
    paymentId: razorpay_payment_id,
  };
  req.body = payload;
  req.params.transactionId = razorpay_order_id;
  await updateWalletTransaction(req, res, true);

  //Aswin update transaction
  if (razorpay_signature !== expectedSign)
    throw new createError(402, "Payment verification failed!");

  // conditional save of rfid/topup charge
  res
    .status(200)
    .json({ status: true, message: "Payment verified successfully" });
};

exports.khaltiVerify = async (req, res) => {
  const config = {
    KHALTI_GATEWAY_URL,
    KHALTI_SECRET_KEY,
  };

  const paymentStatus = await khaltiCallback(req, config);
  // const payload = {
  //   status,
  //   paymentId: purchase_order_id,
  // };
  // req.body = payload;
  // req.params.transactionId = txnId;
  // await updateWalletTransaction(req, res, true);

  res.status(200).json({
    status: true,
    message: "Payment verified successfully",
    paymentStatus,
  });
};


