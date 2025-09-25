const HBL_CONFIG = {
  // Replace with your actual credentials from HBL
  OFFICE_ID: 'your_office_id',
  API_KEY: 'your_api_key',
  ENCRYPTION_KEY_ID: 'your_encryption_key_id',
  MERCHANT_PRIVATE_KEY: 'path_to_your_private_key.pem',
  MERCHANT_PUBLIC_KEY: 'path_to_your_public_key.pem',
  
  // HBL URLs (replace with actual URLs provided by HBL)
  PAYMENT_URL: 'https://hbl-payment-gateway.com/api/payment',
  VERIFY_URL: 'https://hbl-payment-gateway.com/api/verify',
  
  // Environment
  IS_PRODUCTION: false // Set to true for production
};

module.exports = HBL_CONFIG;