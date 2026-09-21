const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'users',
  },
  amount: Number,
  type: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'pending', 'canceled'],
    default: 'pending',
  },
  transactionId: {
    type: String,
    // default: null,
    unique: false,
  },
  currency: {
    type: String,
    default: 'NPR',
  },
  paymentId: String,
  external_payment_ref: String,
  initiated_by: String,
  invoice_id: String,
  reference: String,
  userWalletUpdated: {
    type: Boolean,
    default: false,
  }
}, { timestamps: true });

// Create a compound index to enforce uniqueness for non-null transactionId values
walletTransactionSchema.index({ transactionId: 1 }, { unique: true, partialFilterExpression: { transactionId: { $exists: true } } });

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);

module.exports = WalletTransaction;