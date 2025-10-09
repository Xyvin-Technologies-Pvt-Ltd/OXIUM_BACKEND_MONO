const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  txnId: { type: String, required: true, unique: true },
  merchantId: { type: Number, required: true },
  appId: { type: String, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ["INITIATED", "SUCCESS", "FAILED"], default: "INITIATED" },
  referenceId: { type: String },
  userId: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", transactionSchema);
