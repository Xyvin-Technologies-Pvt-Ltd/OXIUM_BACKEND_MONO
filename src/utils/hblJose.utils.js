// jose.utils.js
const path = require('path');
const fs = require('fs');

let jose;
let keys;

// Lazy-load jose (ESM-only package)
const initJose = async () => {
  if (!jose) jose = await import('jose');
  return jose;
};

// Load RSA keys from files
const loadKeys = async () => {
  try {
    const { importPKCS8, importSPKI } = await initJose();

    const keysPath = path.join(__dirname, '../keys');
    const readKey = (file) => fs.readFileSync(path.join(keysPath, file), 'utf8');

    const keysData = {
      merchantSigningPrivatePEM: readKey('merchant-signing-private.pem'),
      merchantDecryptionPrivatePEM: readKey('merchant-encryption-private.pem'),
      pacoEncryptionPublicPEM: readKey('paco-encryption-public.pem'),
      pacoSigningPublicPEM: readKey('paco-signing-public.pem')
    };

    return {
      merchantSigningPrivateKey: await importPKCS8(keysData.merchantSigningPrivatePEM, 'PS256'),
      merchantDecryptionPrivateKey: await importPKCS8(keysData.merchantDecryptionPrivatePEM, 'RSA-OAEP'),
      pacoEncryptionPublicKey: await importSPKI(keysData.pacoEncryptionPublicPEM, 'RSA-OAEP'),
      pacoSigningPublicKey: await importSPKI(keysData.pacoSigningPublicPEM, 'PS256')
    };
  } catch (error) {
    console.error('Error loading RSA keys:', error);
    throw new Error(`Key loading failed: ${error.message}`);
  }
};

// Initialize keys once
const initializeKeys = async () => {
  if (!keys) keys = await loadKeys();
  return keys;
};

// HBL configuration
const getHblConfig = () => {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    baseUrl: isProd ? process.env.HBL_PROD_BASE_URL : process.env.HBL_UAT_BASE_URL,
    keyId: isProd ? process.env.HBL_PROD_KEY_ID : process.env.HBL_UAT_KEY_ID,
    apiKey: process.env.HBL_API_KEY,
    merchantId: process.env.HBL_MERCHANT_ID,
    successUrl: process.env.HBL_SUCCESS_URL,
    failUrl: process.env.HBL_FAILURE_URL
  };
};

// GUID generator
const generateGuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

// Create JOSE payload (JWS + JWE)
const createJosePayload = async (payload) => {
  try {
    const keys = await initializeKeys();
    const { SignJWT, CompactEncrypt } = await initJose();
    const config = getHblConfig();
    const now = Math.floor(Date.now() / 1000);

    const jwsPayload = {
      ...payload,
      iss: config.apiKey,
      aud: 'PacoAudience',
      CompanyApiKey: config.apiKey,
      iat: now,
      nbf: now,
      exp: now + 3600
    };

    const jws = await new SignJWT(jwsPayload)
      .setProtectedHeader({ alg: 'PS256', typ: 'JWT', kid: config.keyId })
      .sign(keys.merchantSigningPrivateKey);

    return await new CompactEncrypt(new TextEncoder().encode(jws))
      .setProtectedHeader({ alg: 'RSA-OAEP', enc: 'A128CBC-HS256', kid: config.keyId })
      .encrypt(keys.pacoEncryptionPublicKey);
  } catch (error) {
    console.error('JOSE payload creation failed:', error);
    throw new Error(`JOSE encryption failed: ${error.message}`);
  }
};

// Decrypt and verify JOSE response
const decryptJoseResponse = async (encryptedResponse) => {
  try {
    const keys = await initializeKeys();
    const { compactDecrypt, jwtVerify } = await initJose();

    const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
    const jws = new TextDecoder().decode(plaintext);

    const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
      algorithms: ['PS256'],
      audience: 'PacoAudience'
    });

    return payload;
  } catch (error) {
    console.error('JOSE response decryption failed:', error);
    throw new Error(`JOSE decryption failed: ${error.message}`);
  }
};

module.exports = {
  createJosePayload,
  decryptJoseResponse,
  getHblConfig,
  generateGuid
};
