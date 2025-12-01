const HBLTransaction = require('../../models/HBLTransaction');
const WalletTransaction = require('../../models/walletTransactionSchema');
const User = require('../../models/userSchema');
const axios = require('axios');
const { createJosePayload, decryptJoseResponse, getHblConfig } = require('../../utils/hblJose.utils');

exports.generateHblPaymentPage = async (req, res) => {
  try {
    const { amount, description, userId } = req.body;

    if (!amount) {
      return res.status(400).json({
        success: false,
        message: 'Amount is required'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Verify user exists by custom userId
    const user = await User.findOne({ userId: userId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const config = getHblConfig();
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || '1.0.0.1';

    const txnId = `TXN${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
    const invoiceNo = txnId;

    // Create HBL transaction record
    await HBLTransaction.create({
      txnId: txnId,
      merchantId: config.merchantId,
      appId: process.env.HBL_APP_ID,
      amount: parseFloat(amount),
      currency: 'NPR',
      description: description || `Payment for ${txnId}`,
      invoiceNo: invoiceNo,
      userDefined1: process.env.HBL_APP_ID,
      status: 'INITIATED',
      userId: userId, // Store custom userId as string
      createdAt: new Date()
    });

    const hblRequest = {
      amount: parseFloat(amount),
      invoiceNo: invoiceNo,
      description: description || `Payment for ${invoiceNo}`,
      currencyCode: 'NPR',
      appId: process.env.HBL_APP_ID
    };

    const encryptedPayload = await createJosePayload(hblRequest, clientIp);

    const headers = {
      'Content-Type': 'application/jose; charset=utf-8',
      'Accept': 'application/jose',
      'CompanyApiKey': config.apiKey
    };

    const response = await axios.post(
      `${config.baseUrl}/api/1.0/Payment/prePaymentUi`,
      encryptedPayload,
      { headers, timeout: 30000 }
    );

    const result = await decryptJoseResponse(response.data);

    if (result?.response?.Data?.paymentPage?.paymentPageURL) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: txnId },
        {
          status: 'PROCESSING',
          gatewayReference: result.response.Data.orderNo,
          updatedAt: new Date()
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Payment page generated successfully',
        data: result,
        paymentUrl: result.response.Data.paymentPage.paymentPageURL,
        transactionId: txnId
      });
    }

    throw new Error('Invalid response from HBL - missing payment page URL');

  } catch (error) {
    console.error('Payment failed:', error.message);

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate payment page'
    });
  }
};

exports.hblPaymentSuccess = async (req, res) => {
  try {
    const { orderNo, controllerInternalId } = req.query;

    if (!orderNo) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction",
      });
    }

    // Update HBL transaction
    await HBLTransaction.findOneAndUpdate(
      { txnId: orderNo },
      {
        status: "SUCCESS",
        gatewayReference: controllerInternalId,
        referenceId: controllerInternalId,
        paymentMethod: "HBL",
        completedAt: new Date(),
        updatedAt: new Date(),
      }
    );

    // Update wallet
    const hblTransaction = await HBLTransaction.findOne({ txnId: orderNo });
    if (hblTransaction && hblTransaction.userId) {
      const customUserId = hblTransaction.userId;
      const amount = hblTransaction.amount;

      const user = await User.findOne({ userId: customUserId });
      if (user) {
        // Create wallet transaction entry
        await WalletTransaction.create({
          user: user._id,
          amount: amount,
          type: "wallet top-up",
          status: "success",
          transactionId: orderNo,
          currency: "NPR",
          external_payment_ref: controllerInternalId,
          paymentId: controllerInternalId,
          reference: "HBL Payment Gateway",
          userWalletUpdated: true,
        });

        // Update user's wallet
        await User.findOneAndUpdate(
          { userId: customUserId },
          { $inc: { wallet: amount } }
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment successful",
      transactionId: orderNo,
      reference: controllerInternalId,
      amount: hblTransaction?.amount || null,
      userId: hblTransaction?.userId || null,
    });

  } catch (error) {
    console.error("Success callback error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment success handler failed",
      error: error.message,
    });
  }
};


exports.hblPaymentFailure = async (req, res) => {
  try {
    const { invoiceNo, orderNo, respDesc, txnId } = req.query;
    const transactionId = invoiceNo || orderNo || txnId;

    if (transactionId) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: transactionId },
        {
          status: "FAILED",
          errorMessage: respDesc || "Payment cancelled by user",
          completedAt: new Date(),
          updatedAt: new Date(),
        }
      );

      return res.status(200).json({
        success: false,
        message: "Payment failed",
        transactionId,
        error: respDesc || "cancelled",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid transaction",
    });

  } catch (error) {
    console.error("Payment failure handler failed:", error);

    return res.status(500).json({
      success: false,
      message: "Payment failure handler error",
      error: error.message,
    });
  }
};


exports.hblWebhook = async (req, res) => {
  try {
    const encryptedPayload = req.body;
    const decryptedData = await decryptJoseResponse(encryptedPayload);

    const { invoiceNo, orderNo, txnReference, respCode, respDesc, paymentChannel } = decryptedData;
    const transactionId = invoiceNo || orderNo;

    if (transactionId) {
      const updateData = {
        gatewayReference: txnReference,
        paymentMethod: paymentChannel,
        completedAt: new Date(),
        updatedAt: new Date()
      };

      if (respCode === '0000' || respCode === '2000') {
        updateData.status = 'SUCCESS';
        updateData.referenceId = txnReference;

        // Wallet update in webhook
        const hblTransaction = await HBLTransaction.findOne({ txnId: transactionId });
        if (hblTransaction && hblTransaction.userId) {
          // Check if WalletTransaction already exists
          const existingWalletTx = await WalletTransaction.findOne({ transactionId: transactionId });

          if (!existingWalletTx) {
            const customUserId = hblTransaction.userId;
            const amount = hblTransaction.amount;

            // Find user by custom userId
            const user = await User.findOne({ userId: customUserId });
            if (user) {
              // Create WalletTransaction record with user ObjectId
              await WalletTransaction.create({
                user: user._id, // Use MongoDB ObjectId here
                amount: amount,
                type: 'wallet top-up',
                status: 'success',
                transactionId: transactionId,
                currency: 'NPR',
                external_payment_ref: txnReference,
                paymentId: txnReference,
                reference: 'HBL Payment Gateway',
                userWalletUpdated: true
              });

              // Update user wallet using custom userId
              await User.findOneAndUpdate(
                { userId: customUserId },
                { $inc: { wallet: amount } },
                { new: true }
              );

              console.log(`✅ Webhook: Wallet updated for user ${customUserId}: +${amount} NPR`);
            } else {
              console.error(`❌ Webhook: User not found with userId: ${customUserId}`);
            }
          }
        }
      } else {
        updateData.status = 'FAILED';
        updateData.errorMessage = respDesc;
      }

      await HBLTransaction.findOneAndUpdate(
        { txnId: transactionId },
        updateData
      );
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(200).json({ success: false, error: error.message });
  }
};


exports.checkHblTransactionStatus = async (req, res) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }

    const transaction = await HBLTransaction.findOne({ txnId: transactionId });
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: { transaction }
    });

  } catch (error) {
    console.error('Transaction status check failed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check transaction status'
    });
  }
};