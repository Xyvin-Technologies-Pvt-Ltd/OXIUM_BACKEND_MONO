require('dotenv').config();
let jose;

const initJose = async () => {
  if (!jose) jose = await import('jose');
  return jose;
};

const formatPemKey = (keyString, keyType) => {
  if (!keyString) {
    throw new Error(`${keyType} is missing in environment variables`);
  }

  const cleanKey = keyString
    .replace(/-----BEGIN.*?-----/g, '')
    .replace(/-----END.*?-----/g, '')
    .replace(/\s/g, '');

  const [header, footer] = keyType.includes('PRIVATE') 
    ? ['-----BEGIN PRIVATE KEY-----', '-----END PRIVATE KEY-----']
    : ['-----BEGIN PUBLIC KEY-----', '-----END PUBLIC KEY-----'];

  const lines = cleanKey.match(/.{1,64}/g) || [];
  return `${header}\n${lines.join('\n')}\n${footer}`;
};

const loadKeys = async () => {
  const { importPKCS8, importSPKI } = await initJose();

  return {
    merchantSigningPrivateKey: await importPKCS8(
      formatPemKey(process.env.HBL_MERCHANT_SIGNING_PRIVATE_KEY, 'MERCHANT_SIGNING_PRIVATE_KEY'), 
      'PS256'
    ),
    merchantDecryptionPrivateKey: await importPKCS8(
      formatPemKey(process.env.HBL_MERCHANT_DECRYPTION_PRIVATE_KEY, 'MERCHANT_DECRUPTION_PRIVATE_KEY'),
      'RSA-OAEP'
    ),
    pacoEncryptionPublicKey: await importSPKI(
      formatPemKey(process.env.HBL_PACO_ENCRYPTION_PUBLIC_KEY, 'PACO_ENCRYPTION_PUBLIC_KEY'),
      'RSA-OAEP'
    ),
    pacoSigningPublicKey: await importSPKI(
      formatPemKey(process.env.HBL_PACO_SIGNING_PUBLIC_KEY, 'PACO_SIGNING_PUBLIC_KEY'),
      'PS256'
    )
  };
};

let keys;
const initializeKeys = async () => {
  if (!keys) keys = await loadKeys();
  return keys;
};

const getHblConfig = () => ({
  baseUrl: process.env.HBL_UAT_BASE_URL,
  keyId: process.env.HBL_UAT_KEY_ID,
  apiKey: process.env.HBL_API_KEY,
  merchantId: process.env.HBL_MERCHANT_ID,
  successUrl: process.env.HBL_SUCCESS_URL,
  failUrl: process.env.HBL_FAILURE_URL
});

const generateGuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const formatDateTimeSimple = () => {
  return new Date().toISOString().replace(/\.\d+Z$/, '.000Z');
};

const createJosePayload = async (payload, clientIp = '1.0.0.1') => {
  const keys = await initializeKeys();
  const { SignJWT, CompactEncrypt } = await initJose();
  const config = getHblConfig();
  const now = Math.floor(Date.now() / 1000);

  const request = {
    apiRequest: {
      requestMessageID: generateGuid(),
      requestDateTime: formatDateTimeSimple(),
      language: "en-US",
    },
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
    storeCardDetails: { storeCardFlag: "N", storedCardUniqueID: "{{guid}}" },
    installmentPaymentDetails: { ippFlag: "N", installmentPeriod: 0, interestType: null },
    mcpFlag: "N",
    request3dsFlag: "N",
    transactionAmount: {
      amountText: String(Math.round(payload.amount * 100)).padStart(12, '0'),
      currencyCode: "NPR",
      decimalPlaces: 2,
      amount: parseFloat(payload.amount)
    },
    deviceDetails: {
      browserIp: clientIp,
      browser: "Postman Browser",
      browserUserAgent: "Node.js HBL Integration",
      mobileDeviceFlag: "N"
    },
    purchaseItems: [{
      purchaseItemType: "ticket",
      referenceNo: payload.invoiceNo,
      purchaseItemDescription: payload.description || `Payment for ${payload.invoiceNo}`,
      purchaseItemPrice: {
        amountText: String(Math.round(payload.amount * 100)).padStart(12, '0'),
        currencyCode: "NPR",
        decimalPlaces: 2,
        amount: parseFloat(payload.amount)
      },
      subMerchantID: "string",
      passengerSeqNo: 1
    }]
  };

  const jwsPayload = {
    request: request,
    iss: config.apiKey,
    aud: "PacoAudience",
    CompanyApiKey: config.apiKey,
    iat: now,
    nbf: now,
    exp: now + 3600
  };

  const jws = await new SignJWT(jwsPayload)
    .setProtectedHeader({ alg: 'PS256', typ: 'JWT', kid: config.keyId })
    .sign(keys.merchantSigningPrivateKey);

  const encrypted = await new CompactEncrypt(new TextEncoder().encode(jws))
    .setProtectedHeader({ alg: 'RSA-OAEP', enc: 'A128CBC-HS256', kid: config.keyId })
    .encrypt(keys.pacoEncryptionPublicKey);

  return encrypted;
};

const decryptJoseResponse = async (encryptedResponse) => {
  const keys = await initializeKeys();
  const { compactDecrypt, jwtVerify } = await initJose();

  const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
  const jws = new TextDecoder().decode(plaintext);

  const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
    algorithms: ['PS256'],
    clockTolerance: '5 min'
  });

  return payload;
};

module.exports = {
  createJosePayload,
  decryptJoseResponse,
  getHblConfig
};