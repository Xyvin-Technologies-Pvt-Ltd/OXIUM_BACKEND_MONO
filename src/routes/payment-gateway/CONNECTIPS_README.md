# ConnectIPS Payment Gateway Integration

This document provides comprehensive information about the ConnectIPS payment gateway integration for the Node.js server.

## Overview

The ConnectIPS integration provides a complete payment solution with digital signature generation, payment initiation, callback handling, and payment verification.

## Files Created/Updated

### 1. Service Layer

- `src/services/connectIpsService.js` - Core ConnectIPS integration logic

### 2. Controller Layer

- `src/controllers/connectIpsController.js` - HTTP request handlers
- `src/controllers/paymentgateway.controller.js/connectips.controller.js` - Updated to export the controller

### 3. Route Layer

- `src/routes/payment-gateway/connectips.route.js` - Express routes

## API Endpoints

### Payment Initiation

```
POST /api/connectips/initiate
```

**Request Body:**

```json
{
  "orderId": "ORDER_12345",
  "amount": 100.5,
  "description": "Payment for order"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Payment initiated successfully",
  "data": {
    "gatewayUrl": "https://uat.connectips.com/connectipswebgw/loginpage",
    "formData": {
      "MERCHANTID": "your_merchant_id",
      "APPID": "your_app_id",
      "APPNAME": "your_app_name",
      "TXNID": "generated_transaction_id",
      "TXNDATE": "25-12-2024",
      "TXNAMOUNT": "10050",
      "REMARKS": "Payment for order",
      "PARTICULAR": "Payment for order",
      "TOKEN": "Y",
      "SIGNATURE": "base64_encoded_signature"
    },
    "transactionId": "generated_transaction_id",
    "amount": 100.5,
    "orderId": "ORDER_12345"
  }
}
```

### Payment Callbacks

#### Success Callback

```
GET /api/connectips/success
```

Redirects to frontend success page with transaction details.

#### Failure Callback

```
GET /api/connectips/failure
```

Redirects to frontend failure page with error details.

### Payment Verification

#### Manual Verification

```
POST /api/connectips/verify/:txnId
```

**Response:**

```json
{
  "success": true,
  "message": "Payment verification completed",
  "data": {
    "transactionId": "TXN_12345",
    "status": "completed",
    "amount": "100.50",
    "responseCode": "000",
    "responseMessage": "Transaction successful",
    "rawResponse": { ... }
  }
}
```

#### Status Check

```
GET /api/connectips/status/:txnId
```

**Response:**

```json
{
  "success": true,
  "message": "Payment status retrieved successfully",
  "data": {
    "transactionId": "TXN_12345",
    "status": "completed",
    "isSuccess": true,
    "amount": "100.50",
    "responseCode": "000",
    "responseMessage": "Transaction successful"
  }
}
```

## Environment Variables

Add these environment variables to your `.env` file:

```env
# ConnectIPS Configuration
CONNECTIPS_MERCHANT_ID=your_merchant_id
CONNECTIPS_APP_ID=your_app_id
CONNECTIPS_APP_NAME=your_app_name
CONNECTIPS_PASSWORD=your_password
CONNECTIPS_CREDITOR_PASSWORD=certificate_password

# ConnectIPS URLs
CONNECTIPS_GATEWAY_URL=https://uat.connectips.com/connectipswebgw/loginpage
CONNECTIPS_CHECKTXN_URL=https://uat.connectips.com/connectipswebws/api/creditor/validatetxn
CONNECTIPS_SUCCESS_URL=http://localhost:3000/api/connectips/success
CONNECTIPS_FAILURE_URL=http://localhost:3000/api/connectips/failure

# Certificate Path
CONNECTIPS_PFX_PATH=./certificates/CREDITOR.pfx

# Frontend URL (for redirects)
FRONTEND_URL=http://localhost:3000
```

## Required Dependencies

Install the following packages:

```bash
npm install crypto fs path pem nanoid axios node-rsa
```

## Certificate Setup

1. Place your ConnectIPS PFX certificate file in the `certificates/` directory
2. Update the `CONNECTIPS_PFX_PATH` environment variable to point to your certificate
3. Set the `CONNECTIPS_CREDITOR_PASSWORD` environment variable with your certificate password

## Digital Signature Process

The integration uses SHA256WithRSAEncryption for digital signatures:

1. **Load PFX Certificate**: Extracts private key from PFX file
2. **Create Data String**: Sorts parameters and creates query string
3. **Generate Hash**: Creates SHA256 hash of the data string
4. **Sign Hash**: Uses RSA private key to sign the hash
5. **Encode Signature**: Returns base64 encoded signature

## Payment Flow

1. **Initiate Payment**: Client calls `/initiate` with order details
2. **Generate Form**: Server creates payment form with digital signature
3. **Redirect to Gateway**: Client submits form to ConnectIPS gateway
4. **Payment Processing**: User completes payment on ConnectIPS
5. **Callback Handling**: ConnectIPS calls success/failure endpoints
6. **Verification**: Server verifies payment status with ConnectIPS API
7. **Frontend Redirect**: User is redirected to appropriate frontend page

## ConnectIPS Rules Compliance

- **Amount Conversion**: All amounts are converted to paisa (multiply by 100)
- **Transaction ID**: Maximum 20 characters, auto-generated
- **Remarks/Particulars**: Maximum 20 characters, truncated if longer
- **Date Format**: DD-MM-YYYY format
- **Signature**: Uses UPPERCASE keys for signature generation
- **API Calls**: Uses camelCase keys for verification calls

## Error Handling

The integration includes comprehensive error handling:

- **Input Validation**: Validates required fields and data types
- **Certificate Errors**: Handles PFX loading and key extraction errors
- **API Errors**: Manages ConnectIPS API communication failures
- **Callback Errors**: Processes malformed callback data gracefully
- **Network Errors**: Handles timeouts and connection issues

## Security Features

- **Digital Signatures**: All payment requests are digitally signed
- **Input Validation**: Comprehensive validation of all inputs
- **Error Logging**: Detailed logging for debugging and monitoring
- **Timeout Handling**: Prevents hanging requests
- **Certificate Security**: Secure handling of private keys

## Frontend Integration

### Payment Initiation

```javascript
const initiatePayment = async (orderData) => {
  const response = await fetch("/api/connectips/initiate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(orderData),
  });

  const result = await response.json();

  if (result.success) {
    // Create form and submit to ConnectIPS
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.data.gatewayUrl;

    Object.keys(result.data.formData).forEach((key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = result.data.formData[key];
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
  }
};
```

### Payment Status Check

```javascript
const checkPaymentStatus = async (transactionId) => {
  const response = await fetch(`/api/connectips/status/${transactionId}`);
  const result = await response.json();

  if (result.success) {
    console.log("Payment Status:", result.data);
  }
};
```

## Testing

### Test Payment Initiation

```bash
curl -X POST http://localhost:3000/api/connectips/initiate \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST_ORDER_123",
    "amount": 100.00,
    "description": "Test payment"
  }'
```

### Test Payment Verification

```bash
curl -X POST http://localhost:3000/api/connectips/verify/TXN_12345
```

## Production Considerations

1. **Environment Variables**: Ensure all production environment variables are set
2. **Certificate Security**: Store PFX certificate securely
3. **HTTPS**: Use HTTPS for all payment-related endpoints
4. **Logging**: Implement proper logging and monitoring
5. **Error Handling**: Set up alerts for payment failures
6. **Database Updates**: Implement database updates for payment status
7. **Email Notifications**: Add email notifications for payment events

## Troubleshooting

### Common Issues

1. **Certificate Loading Error**: Check PFX file path and password
2. **Signature Generation Error**: Verify certificate format and private key
3. **API Communication Error**: Check ConnectIPS URLs and credentials
4. **Callback Processing Error**: Verify callback URL configuration

### Debug Mode

Enable debug logging by setting:

```env
NODE_ENV=development
```

This will provide detailed console logs for debugging payment issues.

## Support

For ConnectIPS-specific issues, refer to the official ConnectIPS documentation or contact their support team.

For integration issues, check the server logs and ensure all environment variables are properly configured.
