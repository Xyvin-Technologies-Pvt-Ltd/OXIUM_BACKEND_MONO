const mongoose = require('mongoose');




const evConnectorSchema = new mongoose.Schema(
  {
    connectorId: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      default: 'Unavailable',
    },
    qrCode: String,

    energy: String,
    errorCode: String,
    info: String,
    timestamp: String,
    vendorId: String,
    vendorErrorCode: String,

  }
)




const evMachineSchema = new mongoose.Schema(
  {
    location_name: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChargingStation',
    },
    name: String,
    authorization_key: String,
    serial_number: String,
    chargepoint_ref_id: String,
    commissioned_date: String,
    published: String,

    evModel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ev_model',
    },
    // power: Number,
    CPID: {
      type: String,
      unique: true,
      required: true
    },

    chargingTariff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'chargerTariff',

    },
    connectors: [evConnectorSchema],
    configuration_url: String,


    cpidStatus: {
      type: String,
      default: 'Unavailable'
    },

  },
  { timestamps: true }
)

evMachineSchema.index({ location_name: 1 })

const EvMachine = mongoose.model('EvMachine', evMachineSchema)

module.exports = EvMachine;



