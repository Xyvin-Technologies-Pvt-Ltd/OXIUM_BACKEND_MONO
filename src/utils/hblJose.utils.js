const path = require('path');
const fs = require('fs');

let jose;
let keys;

const initJose = async () => {
  if (!jose) jose = await import('jose');
  return jose;
};

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
    throw error;
  }
};

const initializeKeys = async () => {
  if (!keys) keys = await loadKeys();
  return keys;
};

const getHblConfig = () => {
  return {
    baseUrl: 'https://core.demo-paco.2c2p.com', 
    keyId: '7664a2ed0dee4879bdfca0e8ce1ac313',
    apiKey: '65805a1636c74b8e8ac81a991da80be4',
    merchantId: '9104137120',
    successUrl: process.env.HBL_SUCCESS_URL,
    failUrl: process.env.HBL_FAILURE_URL
  };
};

// FIXED: Remove the extra {request: } wrapper
const createJosePayload = async (payload) => {
  try {
    const keys = await initializeKeys();
    const { SignJWT, CompactEncrypt } = await initJose();
    const config = getHblConfig();
    const now = Math.floor(Date.now() / 1000);

    // CORRECT: payload goes directly under apiRequest
    const jwsPayload = {
      apiRequest: payload, 
      iss: config.apiKey,
      aud: 'PacoIssuer', 
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
    console.error('JOSE encryption failed:', error);
    throw error;
  }
};

const decryptJoseResponse = async (encryptedResponse) => {
  try {
    const keys = await initializeKeys();
    const { compactDecrypt, jwtVerify } = await initJose();

    const { plaintext } = await compactDecrypt(encryptedResponse, keys.merchantDecryptionPrivateKey);
    const jws = new TextDecoder().decode(plaintext);

    const { payload } = await jwtVerify(jws, keys.pacoSigningPublicKey, {
      algorithms: ['PS256'],
      audience: 'PacoIssuer' 
    });

    return payload;
  } catch (error) {
    console.error('JOSE decryption failed:', error);
    throw error;
  }
};

module.exports = {
  createJosePayload,
  decryptJoseResponse,
  getHblConfig
};