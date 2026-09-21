const mongoose = require('mongoose');

// Read-only view of the "ocpptransactions" collection, which is owned and written to
// by the OCPP service (NEW_OCPP_SERVER repo). This model exists only so this backend
// can query/aggregate that shared collection and declare the indexes it needs for the
// charging-session report view.
const ocppTransactionViewSchema = new mongoose.Schema(
  {
    transactionId: { type: Number },
    startTime: { type: Date },
    endTime: { type: Date },
    meterStart: { type: Number },
    meterStop: { type: Number },
    cpid: { type: String },
    connectorId: { type: Number },
    closureReason: { type: String },
    transactionMode: { type: String },
    closeBy: { type: String },
    totalAmount: { type: Number },
    chargingTariff: { type: Number },
    tax: { type: String },
    transaction_status: { type: String },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'users' },
  },
  { timestamps: true }
);

ocppTransactionViewSchema.index({ transaction_status: 1, startTime: -1 });
ocppTransactionViewSchema.index({ cpid: 1, startTime: -1 });

const OcppTransactionView = mongoose.model(
  'OcppTransactionView',
  ocppTransactionViewSchema,
  'ocpptransactions'
);

module.exports = OcppTransactionView;
