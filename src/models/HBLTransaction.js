const mongoose = require("mongoose");

const hblTransactionSchema = new mongoose.Schema({
  txnId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  merchantId: { 
    type: String, 
    required: true 
  },
  appId: { 
    type: String, 
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["INITIATED", "PROCESSING", "SUCCESS", "FAILED", "CANCELLED"], 
    default: "INITIATED" 
  },
  // HBL Specific Fields
  gatewayReference: { type: String },
  referenceId: { type: String },
  currency: { type: String, default: "NPR" },
  description: { type: String },
  customerEmail: { type: String },
  customerPhone: { type: String },
  paymentMethod: { type: String },
  errorMessage: { type: String },
  
  // Additional fields
  invoiceNo: { type: String },
  userDefined1: { type: String },
  userDefined2: { type: String },
  userDefined3: { type: String },
  
  completedAt: { type: Date }
}, {
  timestamps: true
});

// Indexes for better performance
hblTransactionSchema.index({ txnId: 1 });
hblTransactionSchema.index({ gatewayReference: 1 });
hblTransactionSchema.index({ status: 1 });
hblTransactionSchema.index({ createdAt: 1 });
hblTransactionSchema.index({ appId: 1 });

module.exports = mongoose.model("HBLTransaction", hblTransactionSchema);