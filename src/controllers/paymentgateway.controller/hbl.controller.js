const HBLTransaction = require('../../models/HBLTransaction');
const axios = require('axios');
const { createJosePayload, decryptJoseResponse, getHblConfig } = require('../../utils/hblJose.utils');

exports.generateHblPaymentPage = async (req, res) => {
  try {
    const { amount, invoiceNo, description, customerEmail, customerPhone, currencyCode, appId } = req.body;

    console.log('📥 Received payment request:', req.body);

    if (!amount || !invoiceNo || !appId) {
      return res.status(400).json({ success: false, message: 'Amount, invoice number and app ID are required' });
    }

    const config = getHblConfig();
    console.log('⚙️ HBL Config:', {
      baseUrl: config.baseUrl,
      merchantId: config.merchantId,
      keyId: config.keyId
    });

    // Create transaction record
    await HBLTransaction.create({
      txnId: invoiceNo,
      merchantId: config.merchantId,
      appId,
      amount: parseFloat(amount),
      currency: currencyCode || 'NPR',
      description: description || `Payment for invoice ${invoiceNo}`,
      customerEmail,
      customerPhone,
      invoiceNo,
      userDefined1: appId,
      status: 'INITIATED',
      createdAt: new Date()
    });

    console.log('✅ Transaction record created');

    // Get client IP
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || '1.0.0.1';

    const hblRequest = {
      amount: parseFloat(amount),
      invoiceNo: invoiceNo,
      description: description || `Payment for ${invoiceNo}`,
      currencyCode: (currencyCode || 'NPR').trim(),
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || '',
      appId: appId || ''
    };

    console.log('📤 Request payload to be encrypted:', JSON.stringify(hblRequest, null, 2));

    const encryptedPayload = await createJosePayload(hblRequest, clientIp);

    const headers = {
      'Content-Type': 'application/jose; charset=utf-8',
      'Accept': 'application/jose',
      'CompanyApiKey': config.apiKey
    };

    console.log('🚀 Sending request to HBL:', `${config.baseUrl}/api/1.0/Payment/prePaymentUi`);

    let result;
    try {
      const response = await axios.post(`${config.baseUrl}/api/1.0/Payment/prePaymentUi`, encryptedPayload, {
        headers,
        timeout: 30000
      });

      console.log('✅ HBL API Response received');
      result = await decryptJoseResponse(response.data);
      console.log('📥 Decrypted response:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('❌ HBL API failed:', error.message);
      
      // Enhanced error logging
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
        console.error('Response data type:', typeof error.response.data);
        console.error('Response data length:', error.response.data?.length);
        
        if (error.response.data && error.response.data.length > 0) {
          try {
            const errorData = await decryptJoseResponse(error.response.data);
            console.error('🔍 Decrypted HBL Error:', JSON.stringify(errorData, null, 2));
            
            return res.status(400).json({
              success: false,
              message: errorData.response?.apiResponse?.responseDescription || 
                       errorData.apiResponse?.responseDescription || 
                       'HBL API error',
              errorDetails: errorData
            });
          } catch (decryptError) {
            console.error('❌ Could not decrypt error response:', decryptError.message);
            console.error('Raw error data (first 500 chars):', error.response.data.substring(0, 500));
          }
        } else {
          console.error('❌ HBL returned empty response body with status 400');
          console.error('Possible reasons:');
          console.error('1. Invalid merchant credentials');
          console.error('2. Invalid API key or token');
          console.error('3. IP whitelisting required');
          console.error('4. Invalid request structure');
        }
      } else if (error.request) {
        console.error('❌ No response received from HBL');
      }
      
      throw error;
    }

    // ✅ Check correct response structure (matching PHP demo)
    if (result?.response?.Data?.paymentPage?.paymentPageURL) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: invoiceNo },
        {
          status: 'PROCESSING',
          gatewayReference: result.response.Data.invoiceNo || result.response.Data.orderNo,
          updatedAt: new Date()
        }
      );

      console.log('✅ Payment page generated successfully');

      return res.status(200).json({
        success: true,
        message: 'Payment page generated successfully',
        data: result,
        paymentUrl: result.response.Data.paymentPage.paymentPageURL,
        transactionId: invoiceNo
      });
    }

    // Log the actual response structure for debugging
    console.error('❌ Invalid response structure:', JSON.stringify(result, null, 2));
    throw new Error('Invalid response from HBL - missing payment page URL');
  } catch (error) {
    console.error('❌ Payment failed:', error.message);
    console.error('Stack:', error.stack);

    if (req.body.invoiceNo) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: req.body.invoiceNo },
        {
          status: 'FAILED',
          errorMessage: error.message,
          updatedAt: new Date()
        }
      );
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate payment page',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Check transaction status
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
      data: {
        transaction: {
          id: transaction.txnId,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          gatewayReference: transaction.gatewayReference,
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt
        }
      }
    });

  } catch (error) {
    console.error('Transaction status check failed:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check transaction status'
    });
  }
};

// Success callback - enhanced logging
exports.hblPaymentSuccess = async (req, res) => {
  try {
    const data = req.method === 'POST' ? req.body : req.query;
    
    console.log('🎯 SUCCESS CALLBACK TRIGGERED:', {
      method: req.method,
      headers: req.headers,
      data: data,
      fullUrl: req.originalUrl
    });

    const { 
      invoiceNo, 
      orderNo, 
      txnReference, 
      respCode, 
      respDesc, 
      paymentChannel,
      txnId
    } = data;

    const transactionId = invoiceNo || orderNo || txnId;

    if (transactionId) {
      console.log(`🎯 Processing success for transaction: ${transactionId}`);
      
      if (respCode === '0000' || respCode === '2000') {
        await HBLTransaction.findOneAndUpdate(
          { txnId: transactionId },
          { 
            status: 'SUCCESS',
            gatewayReference: txnReference,
            referenceId: txnReference,
            paymentMethod: paymentChannel,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        console.log(`✅ PAYMENT SUCCESS: ${transactionId}`);
        return res.redirect(`${process.env.FRONTEND_URL}/payment/success?txnId=${transactionId}&gateway=HBL&ref=${txnReference}`);
      } else {
        console.log(`❌ Payment not successful. Response code: ${respCode}, Description: ${respDesc}`);
        await HBLTransaction.findOneAndUpdate(
          { txnId: transactionId },
          { 
            status: 'FAILED',
            gatewayReference: txnReference,
            errorMessage: respDesc,
            referenceId: txnReference,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?txnId=${transactionId}&gateway=HBL&error=${encodeURIComponent(respDesc || 'payment_failed')}&code=${respCode}`);
      }
    }

    console.log('❌ No transaction ID in success callback');
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL&error=invalid_transaction`);

  } catch (error) {
    console.error('💥 Success callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL&error=processing_error`);
  }
};

// Failure callback - handle both POST and GET
exports.hblPaymentFailure = async (req, res) => {
  try {
    // Handle both POST (req.body) and GET (req.query) requests
    const data = req.method === 'POST' ? req.body : req.query;
    
    const { 
      invoiceNo, 
      orderNo, 
      respDesc,
      txnId  // Some gateways use different field names
    } = data;

    console.log('❌ Payment failure callback received:', {
      method: req.method,
      data: data
    });

    // Use any available transaction identifier
    const transactionId = invoiceNo || orderNo || txnId;

    if (transactionId) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: transactionId },
        { 
          status: 'FAILED',
          errorMessage: respDesc || 'Payment cancelled by user',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      );
      console.log(`❌ Payment marked as failed for: ${transactionId}`);
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?txnId=${transactionId}&gateway=HBL&error=${encodeURIComponent(respDesc || 'cancelled')}`);
    }

    console.log('❌ No transaction ID found in failure callback');
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL`);

  } catch (error) {
    console.error('Payment failure handler failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL`);
  }
};

// Webhook handler
// Webhook handler - enhanced logging
exports.hblWebhook = async (req, res) => {
  try {
    const encryptedPayload = req.body;
    
    console.log('📩 WEBHOOK RECEIVED:', {
      headers: req.headers,
      bodyLength: encryptedPayload?.length
    });

    const decryptedData = await decryptJoseResponse(encryptedPayload);
    console.log('🔓 Decrypted webhook data:', JSON.stringify(decryptedData, null, 2));

    const { invoiceNo, orderNo, txnReference, respCode, respDesc, paymentChannel } = decryptedData;

    const transactionId = invoiceNo || orderNo;

    if (transactionId) {
      console.log(`📩 Webhook processing: ${transactionId}, Code: ${respCode}`);
      
      if (respCode === '0000' || respCode === '2000') {
        await HBLTransaction.findOneAndUpdate(
          { txnId: transactionId },
          { 
            status: 'SUCCESS',
            gatewayReference: txnReference,
            referenceId: txnReference,
            paymentMethod: paymentChannel,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        console.log(`✅ WEBHOOK: Payment successful for: ${transactionId}`);
      } else {
        await HBLTransaction.findOneAndUpdate(
          { txnId: transactionId },
          { 
            status: 'FAILED',
            gatewayReference: txnReference,
            errorMessage: respDesc,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        console.log(`❌ WEBHOOK: Payment failed for: ${transactionId} - ${respDesc}`);
      }
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('💥 Webhook processing failed:', error);
    res.status(200).json({ success: false, error: error.message });
  }
};