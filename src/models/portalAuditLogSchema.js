const mongoose = require('mongoose')

// Who did what in the station portal (logins, password events, report exports).
const portalAuditLogSchema = new mongoose.Schema(
  {
    stationUser: { type: mongoose.Schema.Types.ObjectId, ref: 'StationUser' },
    station: { type: mongoose.Schema.Types.ObjectId, ref: 'ChargingStation' },
    action: { type: String, required: true },
    ip: String,
    userAgent: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
)

portalAuditLogSchema.index({ stationUser: 1, createdAt: -1 })
portalAuditLogSchema.index({ station: 1, createdAt: -1 })

const PortalAuditLog = mongoose.model('PortalAuditLog', portalAuditLogSchema)

module.exports = PortalAuditLog
