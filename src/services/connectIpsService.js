const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const pem = require("pem");
const NodeRSA = require("node-rsa");
const axios = require("axios");
const { nanoid } = require("nanoid");

class ConnectIpsService {
  constructor() {
    this.merchantId = process.env.CONNECTIPS_MERCHANT_ID;
    this.appId = process.env.CONNECTIPS_APP_ID;
    this.appName = process.env.CONNECTIPS_APP_NAME;
    this.password = process.env.CONNECTIPS_PASSWORD;
    this.creditorPassword = process.env.CONNECTIPS_CREDITOR_PASSWORD;
    this.gatewayUrl =
      process.env.CONNECTIPS_GATEWAY_URL ||
      "https://uat.connectips.com/connectipswebgw/loginpage";
    this.checkTxnUrl =
      process.env.CONNECTIPS_CHECKTXN_URL ||
      "https://uat.connectips.com/connectipswebws/api/creditor/validatetxn";
    this.successUrl =
      process.env.CONNECTIPS_SUCCESS_URL ||
      "http://localhost:3000/api/connectips/success";
    this.failureUrl =
      process.env.CONNECTIPS_FAILURE_URL ||
      "http://localhost:3000/api/connectips/failure";
    this.pfxPath =
      process.env.CONNECTIPS_PFX_PATH || "./certificates/CREDITOR.pfx";
  }

  /**
   * Generate a unique transaction ID (max 20 characters)
   */
  generateTransactionId() {
    return nanoid(20);
  }

  /**
   * Convert amount to paisa (multiply by 100)
   */
  convertToPaisa(amount) {
    return Math.round(parseFloat(amount) * 100);
  }

  /**
   * Format date as DD-MM-YYYY
   */
  formatDate(date = new Date()) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  /**
   * Load PFX certificate and extract private key
   */
  async loadPrivateKey() {
    try {
      if (!fs.existsSync(this.pfxPath)) {
        throw new Error(`PFX certificate file not found at: ${this.pfxPath}`);
      }

      const pfxBuffer = fs.readFileSync(this.pfxPath);

      return new Promise((resolve, reject) => {
        pem.readPkcs12(
          pfxBuffer,
          { p12Password: this.creditorPassword },
          (err, cert) => {
            if (err) {
              reject(
                new Error(`Failed to read PFX certificate: ${err.message}`)
              );
              return;
            }

            if (!cert || !cert.key) {
              reject(new Error("No private key found in PFX certificate"));
              return;
            }

            resolve(cert.key);
          }
        );
      });
    } catch (error) {
      throw new Error(`Certificate loading failed: ${error.message}`);
    }
  }

  /**
   * Generate digital signature using SHA256WithRSAEncryption
   */
  async generateDigitalSignature(data) {
    try {
      const privateKeyPem = await this.loadPrivateKey();

      // Convert PEM to NodeRSA format
      const key = new NodeRSA();
      key.importKey(privateKeyPem, "private");

      // Create the data string for signature
      const dataString = Object.keys(data)
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join("&");

      // Generate SHA256 hash
      const hash = crypto.createHash("sha256").update(dataString).digest("hex");

      // Sign the hash with RSA
      const signature = key.sign(hash, "hex", "base64");

      return signature;
    } catch (error) {
      throw new Error(`Digital signature generation failed: ${error.message}`);
    }
  }

  /**
   * Create payment order data
   */
  createPaymentOrder(orderData) {
    const { orderId, amount, description } = orderData;

    const transactionId = this.generateTransactionId();
    const amountInPaisa = this.convertToPaisa(amount);
    const currentDate = this.formatDate();

    // Truncate description to max 20 characters
    const remarks = description ? description.substring(0, 20) : "Payment";

    return {
      MERCHANTID: this.merchantId,
      APPID: this.appId,
      APPNAME: this.appName,
      TXNID: transactionId,
      TXNDATE: currentDate,
      TXNAMOUNT: amountInPaisa.toString(),
      REMARKS: remarks,
      PARTICULAR: remarks,
      TOKEN: "Y",
    };
  }

  /**
   * Initiate payment with ConnectIPS
   */
  async initiatePayment(orderData) {
    try {
      // Validate required fields
      if (!orderData.orderId || !orderData.amount) {
        throw new Error("Order ID and amount are required");
      }

      if (parseFloat(orderData.amount) <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Create payment order
      const paymentOrder = this.createPaymentOrder(orderData);

      // Generate digital signature
      const signature = await this.generateDigitalSignature(paymentOrder);

      // Add signature to payment order
      paymentOrder.SIGNATURE = signature;

      return {
        success: true,
        data: {
          gatewayUrl: this.gatewayUrl,
          formData: paymentOrder,
          transactionId: paymentOrder.TXNID,
          amount: orderData.amount,
          orderId: orderData.orderId,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Verify payment status with ConnectIPS API
   */
  async verifyPayment(transactionId) {
    try {
      if (!transactionId) {
        throw new Error("Transaction ID is required");
      }

      const requestData = {
        merchantId: this.merchantId,
        appId: this.appId,
        password: this.password,
        txnId: transactionId,
      };

      const response = await axios.post(this.checkTxnUrl, requestData, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 30000,
      });

      if (response.data && response.data.responseCode === "000") {
        return {
          success: true,
          data: {
            transactionId: transactionId,
            status: response.data.status || "unknown",
            amount: response.data.amount,
            responseCode: response.data.responseCode,
            responseMessage: response.data.responseMessage,
            rawResponse: response.data,
          },
        };
      } else {
        return {
          success: false,
          error:
            response.data?.responseMessage || "Payment verification failed",
          data: response.data,
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Payment verification failed: ${error.message}`,
        details: error.response?.data || error.message,
      };
    }
  }

  /**
   * Process payment callback data
   */
  processCallbackData(callbackData) {
    try {
      const {
        MERCHANTID,
        APPID,
        TXNID,
        TXNDATE,
        TXNAMOUNT,
        RESPONSECODE,
        RESPONSEMESSAGE,
        STATUS,
        REMARKS,
        PARTICULAR,
      } = callbackData;

      return {
        success: true,
        data: {
          merchantId: MERCHANTID,
          appId: APPID,
          transactionId: TXNID,
          transactionDate: TXNDATE,
          amount: TXNAMOUNT ? (parseInt(TXNAMOUNT) / 100).toFixed(2) : null,
          responseCode: RESPONSECODE,
          responseMessage: RESPONSEMESSAGE,
          status: STATUS,
          remarks: REMARKS,
          particular: PARTICULAR,
          isSuccess: RESPONSECODE === "000",
          rawData: callbackData,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Callback processing failed: ${error.message}`,
      };
    }
  }
}

module.exports = new ConnectIpsService();
