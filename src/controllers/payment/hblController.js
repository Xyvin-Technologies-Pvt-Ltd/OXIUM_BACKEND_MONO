// controllers/hblController.js
const axios = require('axios');
const crypto = require('crypto');
const HBL_CONFIG = require('../../config/hbl.config');
const { encryptData, decryptData } = require('../../helpers/hblUtil');

class HBLController {
  // Generate unique transaction reference
  generateTransactionRef() {
    return 'TXN_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Create payment
  async createPayment(req, res) {
    try {
      const { amount, customerEmail, customerPhone, description, orderId } = req.body;

      // Validate required fields
      if (!amount || !customerEmail) {
        return res.status(400).json({
          success: false,
          error: 'Amount and customer email are required'
        });
      }

      // Validate amount
      const paymentAmount = parseFloat(amount);
      if (isNaN(paymentAmount) || paymentAmount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'Invalid amount'
        });
      }

      const transactionRef = this.generateTransactionRef();
      
      const requestData = {
        office_id: HBL_CONFIG.OFFICE_ID,
        api_key: HBL_CONFIG.API_KEY,
        encryption_key_id: HBL_CONFIG.ENCRYPTION_KEY_ID,
        transaction_ref: transactionRef,
        amount: paymentAmount,
        currency: 'PKR',
        customer_email: customerEmail,
        customer_phone: customerPhone || '',
        description: description || 'Payment for order',
        order_id: orderId || transactionRef,
        return_url: `${req.protocol}://${req.get('host')}/api/hbl/payment-success`,
        cancel_url: `${req.protocol}://${req.get('host')}/api/hbl/payment-cancel`,
        callback_url: `${req.protocol}://${req.get('host')}/api/hbl/payment-callback`,
        timestamp: new Date().toISOString()
      };

      try {
        // Encrypt the request data
        const encryptedData = encryptData(requestData, HBL_CONFIG);
        
        const response = await axios.post(HBL_CONFIG.PAYMENT_URL, {
          encrypted_data: encryptedData,
          office_id: HBL_CONFIG.OFFICE_ID
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HBL_CONFIG.API_KEY}`
          },
          timeout: 30000 // 30 seconds timeout
        });

        // Log successful payment creation
        console.log('Payment created successfully:', {
          transaction_ref: transactionRef,
          amount: paymentAmount,
          customer_email: customerEmail
        });

        res.json({
          success: true,
          transaction_ref: transactionRef,
          payment_url: response.data.payment_url,
          message: 'Payment created successfully'
        });

      } catch (apiError) {
        console.error('HBL API Error:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status
        });

        res.status(500).json({
          success: false,
          error: 'Failed to create payment with HBL gateway',
          details: apiError.response?.data?.message || apiError.message
        });
      }

    } catch (error) {
      console.error('Payment creation error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while creating payment'
      });
    }
  }

  // Verify payment status
  async verifyPayment(req, res) {
    try {
      const { transactionRef } = req.params;

      if (!transactionRef) {
        return res.status(400).json({
          success: false,
          error: 'Transaction reference is required'
        });
      }

      const requestData = {
        office_id: HBL_CONFIG.OFFICE_ID,
        api_key: HBL_CONFIG.API_KEY,
        transaction_ref: transactionRef,
        timestamp: new Date().toISOString()
      };

      try {
        const encryptedData = encryptData(requestData, HBL_CONFIG);
        
        const response = await axios.post(HBL_CONFIG.VERIFY_URL, {
          encrypted_data: encryptedData,
          office_id: HBL_CONFIG.OFFICE_ID
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HBL_CONFIG.API_KEY}`
          },
          timeout: 30000
        });

        // Decrypt response if needed
        let responseData = response.data;
        if (responseData.encrypted_response) {
          responseData = decryptData(responseData.encrypted_response, HBL_CONFIG);
        }

        console.log('Payment verification result:', {
          transaction_ref: transactionRef,
          status: responseData.status
        });

        res.json({
          success: true,
          transaction_ref: transactionRef,
          status: responseData.status,
          data: responseData,
          message: 'Payment status retrieved successfully'
        });

      } catch (apiError) {
        console.error('HBL Verification API Error:', {
          message: apiError.message,
          response: apiError.response?.data,
          status: apiError.response?.status
        });

        res.status(500).json({
          success: false,
          error: 'Failed to verify payment with HBL gateway',
          details: apiError.response?.data?.message || apiError.message
        });
      }

    } catch (error) {
      console.error('Payment verification error:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error while verifying payment'
      });
    }
  }

  // Payment callback handler (webhook)
  async handlePaymentCallback(req, res) {
    try {
      const { transaction_ref, status, encrypted_data, ...otherData } = req.body;

      console.log('Payment callback received:', {
        transaction_ref,
        status,
        timestamp: new Date().toISOString()
      });

      // Verify the payment status by calling HBL API
      const requestData = {
        office_id: HBL_CONFIG.OFFICE_ID,
        api_key: HBL_CONFIG.API_KEY,
        transaction_ref: transaction_ref,
        timestamp: new Date().toISOString()
      };

      try {
        const encryptedVerifyData = encryptData(requestData, HBL_CONFIG);
        
        const verificationResponse = await axios.post(HBL_CONFIG.VERIFY_URL, {
          encrypted_data: encryptedVerifyData,
          office_id: HBL_CONFIG.OFFICE_ID
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HBL_CONFIG.API_KEY}`
          },
          timeout: 30000
        });

        let verifiedData = verificationResponse.data;
        if (verifiedData.encrypted_response) {
          verifiedData = decryptData(verifiedData.encrypted_response, HBL_CONFIG);
        }

        const paymentStatus = verifiedData.status || status;
        
        // Handle different payment statuses
        switch (paymentStatus?.toLowerCase()) {
          case 'completed':
          case 'success':
          case 'successful':
            console.log(`✅ Payment ${transaction_ref} completed successfully`);
            // TODO: Update your database
            // TODO: Send confirmation email
            // TODO: Update order status
            await this.handleSuccessfulPayment(transaction_ref, verifiedData);
            break;

          case 'failed':
          case 'failure':
          case 'error':
            console.log(`❌ Payment ${transaction_ref} failed`);
            // TODO: Handle failed payment
            // TODO: Update order status
            await this.handleFailedPayment(transaction_ref, verifiedData);
            break;

          case 'pending':
          case 'processing':
            console.log(`⏳ Payment ${transaction_ref} is pending`);
            // TODO: Handle pending payment
            await this.handlePendingPayment(transaction_ref, verifiedData);
            break;

          case 'cancelled':
          case 'canceled':
            console.log(`🚫 Payment ${transaction_ref} was cancelled`);
            // TODO: Handle cancelled payment
            await this.handleCancelledPayment(transaction_ref, verifiedData);
            break;

          default:
            console.log(`❓ Unknown payment status for ${transaction_ref}: ${paymentStatus}`);
            await this.handleUnknownPaymentStatus(transaction_ref, paymentStatus, verifiedData);
        }

        // Always respond with 200 to acknowledge receipt
        res.status(200).json({ 
          received: true, 
          transaction_ref: transaction_ref,
          processed_at: new Date().toISOString()
        });

      } catch (verificationError) {
        console.error('Payment verification in callback failed:', verificationError);
        
        // Even if verification fails, acknowledge the callback
        res.status(200).json({ 
          received: true, 
          error: 'Verification failed but callback acknowledged',
          transaction_ref: transaction_ref
        });
      }

    } catch (error) {
      console.error('Callback processing error:', error);
      res.status(500).json({ 
        error: 'Callback processing failed',
        message: error.message 
      });
    }
  }

  // Payment success page handler
  async handlePaymentSuccess(req, res) {
    try {
      const { transaction_ref, status } = req.query;
      
      if (!transaction_ref) {
        return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel`);
      }

      // Verify the payment
      const requestData = {
        office_id: HBL_CONFIG.OFFICE_ID,
        api_key: HBL_CONFIG.API_KEY,
        transaction_ref: transaction_ref,
        timestamp: new Date().toISOString()
      };

      try {
        const encryptedData = encryptData(requestData, HBL_CONFIG);
        
        const response = await axios.post(HBL_CONFIG.VERIFY_URL, {
          encrypted_data: encryptedData,
          office_id: HBL_CONFIG.OFFICE_ID
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HBL_CONFIG.API_KEY}`
          }
        });

        let responseData = response.data;
        if (responseData.encrypted_response) {
          responseData = decryptData(responseData.encrypted_response, HBL_CONFIG);
        }

        if (responseData.status?.toLowerCase() === 'completed' || 
            responseData.status?.toLowerCase() === 'success') {
          // Redirect to success page
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/success?ref=${transaction_ref}`);
        } else {
          // Redirect to cancel page
          res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel?ref=${transaction_ref}`);
        }

      } catch (error) {
        console.error('Payment verification on success page failed:', error);
        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/error`);
      }

    } catch (error) {
      console.error('Payment success handler error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/error`);
    }
  }

  // Payment cancel page handler
  async handlePaymentCancel(req, res) {
    try {
      const { transaction_ref } = req.query;
      console.log(`Payment cancelled for transaction: ${transaction_ref}`);
      
      // TODO: Update your database with cancelled status
      
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/cancel?ref=${transaction_ref || 'unknown'}`);
    } catch (error) {
      console.error('Payment cancel handler error:', error);
      res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/error`);
    }
  }

  
}

module.exports = new HBLController();