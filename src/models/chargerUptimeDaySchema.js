const mongoose = require('mongoose')

// One charger's uptime for one completed Nepal day, kept permanently. Raw OCPP logs expire
// after 30 days, so these daily rows are what long-range uptime reports are built from.
// Written by services/uptimeService.js; never edited by hand.
const incidentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['offline', 'fault'], required: true },
    connectorId: Number,
    status: String,
    errorCode: String,
    start: Date,
    end: Date,
    durationSeconds: Number,
  },
  { _id: false }
)

const chargerUptimeDaySchema = new mongoose.Schema(
  {
    cpid: { type: String, required: true },
    chargerId: { type: mongoose.Schema.Types.ObjectId, ref: 'EvMachine' },
    stationId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation' },
    day: { type: String, required: true }, // YYYY-MM-DD, Nepal time

    // Seconds of the day with log data (less than 86400 only for the first day logs exist)
    coveredSeconds: { type: Number, default: 0 },
    onlineSeconds: { type: Number, default: 0 },
    offlineSeconds: { type: Number, default: 0 },
    // Online time during which at least one connector reported Faulted/Unavailable
    faultSeconds: { type: Number, default: 0 },
    offlineIncidents: { type: Number, default: 0 },
    faultIncidents: { type: Number, default: 0 },
    incidents: { type: [incidentSchema], default: [] },
    computedAt: Date,
  },
  { timestamps: true }
)

chargerUptimeDaySchema.index({ cpid: 1, day: 1 }, { unique: true })
chargerUptimeDaySchema.index({ stationId: 1, day: 1 })

const ChargerUptimeDay = mongoose.model('ChargerUptimeDay', chargerUptimeDaySchema)

module.exports = ChargerUptimeDay
