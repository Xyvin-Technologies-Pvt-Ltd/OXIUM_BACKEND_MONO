const HBLTransaction = require('../../models/HBLTransaction');
const axios = require('axios');
const { createJosePayload, decryptJoseResponse, getHblConfig } = require('../../utils/hblJose.utils');

exports.generateHblPaymentPage = async (req, res) => {
  try {
    const { amount, invoiceNo, description, customerEmail, customerPhone, currencyCode, appId } = req.body;

    if (!amount || !invoiceNo || !appId) {
      return res.status(400).json({ success: false, message: 'Amount, invoice number and app ID are required' });
    }

    const config = getHblConfig();

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

    // FIXED: Correct field names matching PHP demo
    const hblRequest = {
      merchantID: config.merchantId, 
      invoiceNo: invoiceNo,
      description: description || `Payment for ${invoiceNo}`,
      amount: parseFloat(amount).toFixed(2),
      currencyCode: (currencyCode || 'NPR').trim(),
      paymentChannel: ['CC', 'DC', 'IB'],
      customerEmail: customerEmail,
      customerMobileno: customerPhone, 
      userDefined1: appId,
      userDefined2: '',
      userDefined3: '',
      userDefined4: '',
      userDefined5: '',
      frontendReturnUrl: `${config.successUrl}?txnId=${invoiceNo}`,
      frontendCancelUrl: `${config.failUrl}?txnId=${invoiceNo}`,
      backendReturnUrl: `${process.env.BASE_URL}/api/v1/payment/hbl/webhook`,
      enable3DS: 'N'
    };

    const encryptedPayload = await createJosePayload(hblRequest);

    const headers = {
      'Content-Type': 'application/jose; charset=utf-8',
      Accept: 'application/jose',
      token: config.apiKey,
      CompanyApiKey: config.apiKey
    };

    let result;
    try {
      const response = await axios.post(`${config.baseUrl}/api/2.0/Payment/prePaymentUi`, encryptedPayload, {
        headers,
        timeout: 30000
      });

      result = await decryptJoseResponse(response.data);
    } catch (error) {
      console.error('HBL API failed:', error.message);
      if (error.response?.data) {
        try {
          const errorData = await decryptJoseResponse(error.response.data);
          console.error('HBL Error:', errorData);
          return res.status(400).json({
            success: false,
            message: errorData.response?.apiResponse?.responseDescription || 'HBL API error'
          });
        } catch (e) {
          console.error('Could not decrypt error');
        }
      }
      throw error;
    }

    // FIXED: Check correct response structure
    if (result?.response?.Data?.paymentPage?.paymentPageURL) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: invoiceNo },
        {
          status: 'PROCESSING',
          gatewayReference: result.response.Data.invoiceNo,
          updatedAt: new Date()
        }
      );

      return res.status(200).json({
        success: true,
        message: 'Payment page generated successfully',
        data: result,
        paymentUrl: result.response.Data.paymentPage.paymentPageURL,
        transactionId: invoiceNo
      });
    }

    throw new Error('Invalid response from HBL');
  } catch (error) {
    console.error('Payment failed:', error.message);

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
      message: error.message || 'Failed to generate payment page'
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

// Success callback
exports.hblPaymentSuccess = async (req, res) => {
  try {
    const { invoiceNo, txnReference, respCode, respDesc, paymentChannel } = req.body;

    console.log('✅ Payment success callback:', req.body);

    if (invoiceNo) {
      if (respCode === '0000' || respCode === '2000') {
        await HBLTransaction.findOneAndUpdate(
          { txnId: invoiceNo },
          { 
            status: 'SUCCESS',
            gatewayReference: txnReference,
            referenceId: txnReference,
            paymentMethod: paymentChannel,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        return res.redirect(`${process.env.FRONTEND_URL}/payment/success?txnId=${invoiceNo}&gateway=HBL`);
      } else {
        await HBLTransaction.findOneAndUpdate(
          { txnId: invoiceNo },
          { 
            status: 'FAILED',
            gatewayReference: txnReference,
            errorMessage: respDesc,
            referenceId: txnReference,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        );
        return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?txnId=${invoiceNo}&gateway=HBL&error=${encodeURIComponent(respDesc)}`);
      }
    }

    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL&error=invalid_transaction`);

  } catch (error) {
    console.error('Payment success handler failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL&error=processing_error`);
  }
};

// Failure callback
exports.hblPaymentFailure = async (req, res) => {
  try {
    const { invoiceNo, respDesc } = req.body;

    console.log('❌ Payment failure callback:', req.body);

    if (invoiceNo) {
      await HBLTransaction.findOneAndUpdate(
        { txnId: invoiceNo },
        { 
          status: 'FAILED',
          errorMessage: respDesc || 'Payment cancelled by user',
          completedAt: new Date(),
          updatedAt: new Date()
        }
      );
      return res.redirect(`${process.env.FRONTEND_URL}/payment/failed?txnId=${invoiceNo}&gateway=HBL&error=${encodeURIComponent(respDesc || 'cancelled')}`);
    }

    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL`);

  } catch (error) {
    console.error('Payment failure handler failed:', error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed?gateway=HBL`);
  }
};

// Webhook handler
exports.hblWebhook = async (req, res) => {
  try {
    const encryptedPayload = req.body;
    
    console.log('📩 Received HBL webhook');

    const decryptedData = await decryptJoseResponse(encryptedPayload);
    console.log('Decrypted webhook data:', decryptedData);

    const { invoiceNo, txnReference, respCode, respDesc, paymentChannel } = decryptedData;

    if (respCode === '0000' || respCode === '2000') {
      await HBLTransaction.findOneAndUpdate(
        { txnId: invoiceNo },
        { 
          status: 'SUCCESS',
          gatewayReference: txnReference,
          referenceId: txnReference,
          paymentMethod: paymentChannel,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      );
      console.log(`✅ Payment successful for invoice: ${invoiceNo}`);
    } else {
      await HBLTransaction.findOneAndUpdate(
        { txnId: invoiceNo },
        { 
          status: 'FAILED',
          gatewayReference: txnReference,
          referenceId: txnReference,
          errorMessage: respDesc,
          completedAt: new Date(),
          updatedAt: new Date()
        }
      );
      console.log(`❌ Payment failed for invoice: ${invoiceNo} - ${respDesc}`);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('Webhook processing failed:', error);
    res.status(200).json({ success: false, error: error.message });
  }
};