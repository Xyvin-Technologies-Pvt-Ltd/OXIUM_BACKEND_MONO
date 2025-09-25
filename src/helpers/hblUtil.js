// Encrypt sensitive data using RSA 4096-bit key
const encryptData = (data) => {
    try {
      const publicKey = require('fs').readFileSync(this.config.MERCHANT_PUBLIC_KEY, 'utf8');
      const buffer = Buffer.from(JSON.stringify(data));
      const encrypted = crypto.publicEncrypt({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, buffer);
      return encrypted.toString('base64');
    } catch (error) {
      console.error('Encryption error:', error);    
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt response data
  const decryptData = (encryptedData) => {
    try {
      const privateKey = require('fs').readFileSync(this.config.MERCHANT_PRIVATE_KEY, 'utf8');
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt({
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, buffer);
      return JSON.parse(decrypted.toString());
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  module.exports = {
    encryptData,
    decryptData
  }