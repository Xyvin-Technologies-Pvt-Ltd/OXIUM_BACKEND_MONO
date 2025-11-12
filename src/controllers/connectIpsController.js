const connectIpsService = require("../services/connectIpsService");

class ConnectIpsController {
  /**
   * Initiate payment with ConnectIPS
   * POST /api/connectips/initiate
   */
  async initiatePayment(req, res) {
    try {
      const { orderId, amount, description } = req.body;

      // Validate required fields
      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: "Order ID is required",
          error: "Order ID is missing from request body",
        });
      }

      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "Amount is required",
          error: "Amount is missing from request body",
        });
      }

      // Validate amount is a positive number
      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount",
          error: "Amount must be a positive number",
        });
      }

      // Initiate payment
      const result = await connectIpsService.initiatePayment({
        orderId,
        amount: paymentAmount,
        description: description || `Payment for order ${orderId}`,
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Payment initiation failed",
          error: result.error,
        });
      }

      // Log successful payment initiation
      console.log("ConnectIPS payment initiated:", {
        orderId,
        amount: paymentAmount,
        transactionId: result.data.transactionId,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "Payment initiated successfully",
        data: result.data,
      });
    } catch (error) {
      console.error("ConnectIPS payment initiation error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "Failed to initiate payment",
      });
    }
  }

  /**
   * Handle successful payment callback
   * GET /api/connectips/success
   */
  async handleSuccess(req, res) {
    try {
      console.log("ConnectIPS success callback received:", {
        query: req.query,
        timestamp: new Date().toISOString(),
      });

      // Process callback data
      const result = connectIpsService.processCallbackData(req.query);

      if (!result.success) {
        console.error("Failed to process success callback:", result.error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/payment/error?message=callback_processing_failed`
        );
      }

      const { data } = result;

      // Log successful payment
      console.log("✅ ConnectIPS payment successful:", {
        transactionId: data.transactionId,
        amount: data.amount,
        orderId: data.remarks,
        responseCode: data.responseCode,
        timestamp: new Date().toISOString(),
      });

      // TODO: Update your database with successful payment
      // TODO: Send confirmation email
      // TODO: Update order status
      // TODO: Process any business logic for successful payment

      // Redirect to frontend success page
      const redirectUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/payment/success?ref=${data.transactionId}&amount=${data.amount}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("ConnectIPS success callback error:", error);
      res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/payment/error?message=callback_error`
      );
    }
  }

  /**
   * Handle failed payment callback
   * GET /api/connectips/failure
   */
  async handleFailure(req, res) {
    try {
      console.log("ConnectIPS failure callback received:", {
        query: req.query,
        timestamp: new Date().toISOString(),
      });

      // Process callback data
      const result = connectIpsService.processCallbackData(req.query);

      if (!result.success) {
        console.error("Failed to process failure callback:", result.error);
        return res.redirect(
          `${
            process.env.FRONTEND_URL || "http://localhost:3000"
          }/payment/error?message=callback_processing_failed`
        );
      }

      const { data } = result;

      // Log failed payment
      console.log("❌ ConnectIPS payment failed:", {
        transactionId: data.transactionId,
        amount: data.amount,
        orderId: data.remarks,
        responseCode: data.responseCode,
        responseMessage: data.responseMessage,
        timestamp: new Date().toISOString(),
      });

      // TODO: Update your database with failed payment
      // TODO: Send failure notification email
      // TODO: Update order status
      // TODO: Process any business logic for failed payment

      // Redirect to frontend failure page
      const redirectUrl = `${
        process.env.FRONTEND_URL || "http://localhost:3000"
      }/payment/failure?ref=${data.transactionId}&message=${encodeURIComponent(
        data.responseMessage || "Payment failed"
      )}`;
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("ConnectIPS failure callback error:", error);
      res.redirect(
        `${
          process.env.FRONTEND_URL || "http://localhost:3000"
        }/payment/error?message=callback_error`
      );
    }
  }

  /**
   * Verify payment status manually
   * POST /api/connectips/verify/:txnId
   */
  async verifyPayment(req, res) {
    try {
      const { txnId } = req.params;

      if (!txnId) {
        return res.status(400).json({
          success: false,
          message: "Transaction ID is required",
          error: "Transaction ID parameter is missing",
        });
      }

      // Verify payment with ConnectIPS
      const result = await connectIpsService.verifyPayment(txnId);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Payment verification failed",
          error: result.error,
          details: result.details,
        });
      }

      // Log verification result
      console.log("ConnectIPS payment verification:", {
        transactionId: txnId,
        status: result.data.status,
        responseCode: result.data.responseCode,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "Payment verification completed",
        data: result.data,
      });
    } catch (error) {
      console.error("ConnectIPS payment verification error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "Failed to verify payment",
      });
    }
  }

  /**
   * Get payment status (alternative endpoint)
   * GET /api/connectips/status/:txnId
   */
  async getPaymentStatus(req, res) {
    try {
      const { txnId } = req.params;

      if (!txnId) {
        return res.status(400).json({
          success: false,
          message: "Transaction ID is required",
          error: "Transaction ID parameter is missing",
        });
      }

      // Verify payment with ConnectIPS
      const result = await connectIpsService.verifyPayment(txnId);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Payment status check failed",
          error: result.error,
          details: result.details,
        });
      }

      res.json({
        success: true,
        message: "Payment status retrieved successfully",
        data: {
          transactionId: txnId,
          status: result.data.status,
          isSuccess: result.data.responseCode === "000",
          amount: result.data.amount,
          responseCode: result.data.responseCode,
          responseMessage: result.data.responseMessage,
        },
      });
    } catch (error) {
      console.error("ConnectIPS payment status check error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: "Failed to check payment status",
      });
    }
  }
}

module.exports = new ConnectIpsController();
