const mongoose = require('mongoose')

// Login for the station reports portal. Deliberately separate from Admin: a station
// user can never sign in to the CMS and only ever sees data for its own station.
const stationUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, trim: true },
    password: { type: String, required: true, select: false },

    // One portal user per station, enforced by the unique index.
    station: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChargingStation',
      required: true,
      unique: true,
    },

    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: true },

    // Embedded in every portal token. Bumping it invalidates all issued tokens
    // (password change/reset, deactivation).
    tokenVersion: { type: Number, default: 0 },

    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: Date,
    lastLoginAt: Date,

    resetOtpHash: { type: String, select: false },
    resetOtpExpiresAt: { type: Date, select: false },
    resetOtpRequestedAt: { type: Date, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  },
  { timestamps: true }
)

const StationUser = mongoose.model('StationUser', stationUserSchema)

module.exports = StationUser
