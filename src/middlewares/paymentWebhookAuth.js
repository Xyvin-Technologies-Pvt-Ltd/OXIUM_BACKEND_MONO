const createError = require("http-errors");

/**
 * Validates X-Payment-Webhook-Secret for payment gateway callbacks (no JWT).
 */
function paymentWebhookAuth(req, res, next) {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!expected) {
    return next(createError(503, "PAYMENT_WEBHOOK_SECRET is not configured"));
  }
  const provided = req.headers["x-payment-webhook-secret"];
  if (!provided || String(provided) !== expected) {
    return next(createError(403, "Invalid webhook credentials"));
  }
  next();
}

module.exports = paymentWebhookAuth;
