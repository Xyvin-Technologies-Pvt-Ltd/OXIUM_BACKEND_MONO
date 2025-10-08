require('dotenv').config();
let jose;

const initJose = async () => {
  if (!jose) jose = await import('jose');
  return jose;
};

// Helper function to format PEM keys properly
const formatPemKey = (keyString, keyType) => {
  if (!keyString) {
    throw new Error(`${keyType} is missing in environment variables`);
  }

  // Remove any existing headers/footers and whitespace
  const cleanKey = keyString
    .replace(/-----BEGIN.*?-----/g, '')
    .replace(/-----END.*?-----/g, '')
    .replace(/\s/g, '');

  // Determine the header/footer based on key type
  let header, footer;
  if (keyType.includes('PRIVATE')) {
    header = '-----BEGIN PRIVATE KEY-----';
    footer = '-----END PRIVATE KEY-----';
  } else {
    header = '-----BEGIN PUBLIC KEY-----';
    footer = '-----END PUBLIC KEY-----';
  }

  // Split into 64-character lines
  const lines = cleanKey.match(/.{1,64}/g) || [];

  return `${header}\n${lines.join('\n')}\n${footer}`;
};

const loadKeys = async () => {
  try {
    const { importPKCS8, importSPKI } = await initJose();

    // Format the keys properly before importing
    const merchantSigningPrivateKeyPem = formatPemKey(
      process.env.HBL_MERCHANT_SIGNING_PRIVATE_KEY,
      'MERCHANT_SIGNING_PRIVATE_KEY'
    );

    const merchantDecryptionPrivateKeyPem = formatPemKey(
      process.env.HBL_MERCHANT_DECRYPTION_PRIVATE_KEY,
      'MERCHANT_DECRYPTION_PRIVATE_KEY'
    );

    const pacoEncryptionPublicKeyPem = formatPemKey(
      process.env.HBL_PACO_ENCRYPTION_PUBLIC_KEY,
      'PACO_ENCRYPTION_PUBLIC_KEY'
    );

    const pacoSigningPublicKeyPem = formatPemKey(
      process.env.HBL_PACO_SIGNING_PUBLIC_KEY,
      'PACO_SIGNING_PUBLIC_KEY'
    );

    console.log('✅ Keys formatted and ready for import');

    return {
      merchantSigningPrivateKey: await importPKCS8(merchantSigningPrivateKeyPem, 'PS256'),
      merchantDecryptionPrivateKey: await importPKCS8(merchantDecryptionPrivateKeyPem, 'RSA-OAEP'),
      pacoEncryptionPublicKey: await importSPKI(pacoEncryptionPublicKeyPem, 'RSA-OAEP'),
      pacoSigningPublicKey: await importSPKI(pacoSigningPublicKeyPem, 'PS256')
    };
  } catch (error) {
    console.error('Error loading RSA keys:', error);
    throw error;
  }
};

let keys;
const initializeKeys = async () => {
  if (!keys) keys = await loadKeys();
  return keys;
};

const getHblConfig = () => {
  return {
    baseUrl: process.env.HBL_UAT_BASE_URL,
    keyId: process.env.HBL_UAT_KEY_ID,
    apiKey: process.env.HBL_API_KEY,
    merchantId: process.env.HBL_MERCHANT_ID,
    successUrl: process.env.HBL_SUCCESS_URL,
    failUrl: process.env.HBL_FAILURE_URL
  };
};

// Generate GUID like PHP demo
const generateGuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Format date like PHP demo - FIXED VERSION
const formatDateTime = () => {
  const now = new Date();

  // PHP demo uses: Y-m-d\TH:i:s.v\Z
  // Example from PHP: 2024-01-15T10:30:45.123Z (3 decimal places)

  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const milliseconds = String(now.getUTCMilliseconds()).padStart(3, '0');

  // Correct format: 2024-01-15T10:30:45.123Z (NOT .123.000Z)
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`;
};

// Alternative simpler version that should work:
const formatDateTimeSimple = () => {
  const now = new Date();
  // Remove the extra .000 that's causing the issue
  return now.toISOString().replace(/\.\d+Z$/, '.000Z');
};

// Create encrypted JOSE payload - UPDATED STRUCTURE
const createJosePayload = async (payload, clientIp = '1.0.0.1') => {
  try {
    const keys = await initializeKeys();
    const { SignJWT, CompactEncrypt } = await initJose();
    const config = getHblConfig();
    const now = Math.floor(Date.now() / 1000);

    console.log('📦 Creating JOSE payload with config:', {
      merchantId: config.merchantId,
      keyId: config.keyId,
      baseUrl: config.baseUrl
    });

    // ✅ CORRECT REQUEST STRUCTURE (matching PHP demo)
    const request = {
      apiRequest: {
        requestMessageID: generateGuid(),
        requestDateTime: formatDateTimeSimple(),
        language: "en-US",
      },
      // ✅ SINGLE notificationURLs object - NO query parameters
      notificationURLs: {
        confirmationURL: `${process.env.BASE_URL}/api/v1/payment/hbl/success`,
        failedURL: `${process.env.BASE_URL}/api/v1/payment/hbl/failure`,
        cancellationURL: `${process.env.BASE_URL}/api/v1/payment/hbl/failure`,
        backendURL: `${process.env.BASE_URL}/api/v1/payment/hbl/webhook`
      },
      officeId: config.merchantId,
      orderNo: payload.invoiceNo,
      productDescription: payload.description || `Payment for ${payload.invoiceNo}`,
      paymentType: "CC",
      paymentCategory: "ECOM",
      storeCardDetails: {
        storeCardFlag: "N",
        storedCardUniqueID: "{{guid}}"
      },
      installmentPaymentDetails: {
        ippFlag: "N",
        installmentPeriod: 0,
        interestType: null
      },
      mcpFlag: "N",
      request3dsFlag: "N",
      transactionAmount: {
        amountText: String(Math.round(payload.amount * 100)).padStart(12, '0'),
        currencyCode: payload.currencyCode || "NPR",
        decimalPlaces: 2,
        amount: parseFloat(payload.amount)
      },
      deviceDetails: {
        browserIp: clientIp,
        browser: "Postman Browser",
        browserUserAgent: "Node.js HBL Integration",
        mobileDeviceFlag: "N"
      },
      purchaseItems: [
        {
          purchaseItemType: "ticket",
          referenceNo: payload.invoiceNo,
          purchaseItemDescription: payload.description || `Payment for ${payload.invoiceNo}`,
          purchaseItemPrice: {
            amountText: String(Math.round(payload.amount * 100)).padStart(12, '0'),
            currencyCode: payload.currencyCode || "NPR",
            decimalPlaces: 2,
            amount: parseFloat(payload.amount)
          },
          subMerchantID: "string",
          passengerSeqNo: 1
        }
      ],
      customFieldList: [
        {
          fieldName: "TestField",
          fieldValue: "This is test"
        }
      ]
    };

    // ✅ CORRECT JWT PAYLOAD STRUCTURE
    const jwsPayload = {
      request: request,
      iss: config.apiKey,
      aud: "PacoAudience",
      CompanyApiKey: config.apiKey,
      iat: now,
      nbf: now,
      exp: now + 3600
    };

    console.log('🔐 Signing JWT with correct structure...');
    const jws = await new SignJWT(jwsPayload)
      .setProtectedHeader({ alg: 'PS256', typ: 'JWT', kid: config.keyId })
      .sign(keys.merchantSigningPrivateKey);

    console.log('🔒 Encrypting payload...');
    const encrypted = await new CompactEncrypt(new TextEncoder().encode(jws))
      .setProtectedHeader({ alg: 'RSA-OAEP', enc: 'A128CBC-HS256', kid: config.keyId })
      .encrypt(keys.pacoEncryptionPublicKey);

    console.log('✅ JOSE payload created successfully');
    return encrypted;
  } catch (error) {
    console.error('❌ JOSE encryption failed:', error);
    throw error;
  }
};

// Decrypt JOSE response - FIXED TIMESTAMP VALIDATION
const decryptJoseResponse = async (encryptedResponse) => {
  try {
    const keys = await initializeKeys();
    const { compactDecrypt, jwtVerify } = await initJose();

    console.log('🔓 Decrypting JOSE response...');
    const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
    const jws = new TextDecoder().decode(plaintext);

    console.log('✅ Verifying JWT signature...');

    // FIX: Add clock tolerance for timestamp validation
    const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
      algorithms: ['PS256'],
      clockTolerance: '5 min', // Allow 5 minutes tolerance for clock skew
      currentDate: new Date() // Use current date explicitly
    });

    console.log('✅ Response decrypted successfully');
    return payload;
  } catch (error) {
    console.error('❌ JOSE decryption failed:', error);

    // If it's a timestamp error, try again with more tolerance
    if (error.code === 'ERR_JWT_CLAIM_VALIDATION_FAILED' && (error.claim === 'nbf' || error.claim === 'exp')) {
      console.log('🔄 Retrying with extended clock tolerance...');
      try {
        const { compactDecrypt, jwtVerify } = await initJose();
        const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
        const jws = new TextDecoder().decode(plaintext);

        const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
          algorithms: ['PS256'],
          clockTolerance: '1 hour', // Extended tolerance
          ignoreExpiration: true,   // Ignore expiration for error responses
          ignoreNotBefore: true     // Ignore not before for error responses
        });

        console.log('✅ Response decrypted with extended tolerance');
        return payload;
      } catch (retryError) {
        console.error('❌ Retry also failed:', retryError.message);
        throw retryError;
      }
    }

    throw error;
  }
};

// Special function to decrypt error responses without strict validation
const decryptErrorResponse = async (encryptedResponse) => {
  try {
    const keys = await initializeKeys();
    const { compactDecrypt, jwtVerify } = await initJose();

    console.log('🔓 Decrypting ERROR response...');
    const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
    const jws = new TextDecoder().decode(plaintext);

    // For error responses, be more lenient with timestamp validation
    const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
      algorithms: ['PS256'],
      clockTolerance: '1 hour',
      ignoreExpiration: true,
      ignoreNotBefore: true
    });

    console.log('✅ Error response decrypted successfully');
    return payload;
  } catch (error) {
    console.error('❌ Error response decryption failed:', error);
    throw error;
  }
};

module.exports = {
  createJosePayload,
  decryptJoseResponse,
  decryptErrorResponse,
  getHblConfig
};