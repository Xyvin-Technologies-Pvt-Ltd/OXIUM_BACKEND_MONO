const crypto = require("crypto");
const bcrypt = require("bcrypt");
const createError = require("http-errors");
const StationUser = require("../../models/stationUserSchema");
const ChargingStation = require("../../models/chargingStationSchema");
const EvMachine = require("../../models/evMachineSchema");
const { hashPassword, comparePassword } = require("../../utils/hashPassword");
const { generateNumericOtp } = require("../../utils/generateSecurePassword");
const {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} = require("../../utils/portalTokens");
const { logPortalEvent } = require("../../helpers/portalAudit");
const { sendPortalOtpMail } = require("../../helpers/portalMails");
const {
  portalLoginSchema,
  portalChangePasswordSchema,
  portalForgotPasswordSchema,
  portalResetPasswordSchema,
} = require("../../validation");

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const OTP_VALID_MINUTES = 10;
const OTP_RESEND_INTERVAL_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

// Compared against when the email is unknown, so response time does not reveal
// which emails have accounts.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("station-portal-timing-guard", 10);

function validate(schema, data) {
  const { error, value } = schema.validate(data, { stripUnknown: true });
  if (error) {
    throw createError(400, error.details.map((detail) => detail.message).join(", "));
  }
  return value;
}

const hashOtp = (otp) => crypto.createHash("sha256").update(otp).digest("hex");

const otpMatches = (otp, storedHash) => {
  const a = Buffer.from(hashOtp(otp), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const refreshCookieOptions = (req) => ({
  httpOnly: true,
  secure: process.env.PORTAL_COOKIE_SECURE
    ? process.env.PORTAL_COOKIE_SECURE === "true"
    : process.env.NODE_ENV === "production",
  sameSite: process.env.PORTAL_COOKIE_SAMESITE || "lax",
  // Only sent to /portal/auth/*, never to data endpoints
  path: `${req.baseUrl}/auth`,
});

// Sets the refresh cookie and returns the access token for the response body
function issueSession(req, res, user) {
  res.cookie(REFRESH_COOKIE_NAME, signRefreshToken(user), {
    ...refreshCookieOptions(req),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  return { accessToken: signAccessToken(user), expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

const clearSession = (req, res) => res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions(req));

const toPublicUser = (user, station) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt,
  station: { id: user.station, name: station?.name },
});

exports.login = async (req, res) => {
  const { email, password } = validate(portalLoginSchema, req.body);
  const invalidCredentials = () => createError(401, "Invalid email or password");

  const user = await StationUser.findOne({ email }).select("+password");
  if (!user) {
    await comparePassword(password, DUMMY_PASSWORD_HASH);
    await logPortalEvent(req, "login_failed", { meta: { email, reason: "unknown_email" } });
    throw invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logPortalEvent(req, "login_blocked", { user, meta: { reason: "locked" } });
    throw createError(423, "Too many failed attempts. Try again in a few minutes.");
  }

  const match = await comparePassword(password, user.password);
  if (!match) {
    const updated = await StationUser.findByIdAndUpdate(
      user._id,
      { $inc: { failedLoginCount: 1 } },
      { new: true }
    );
    if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
      await StationUser.updateOne(
        { _id: user._id },
        { $set: { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS), failedLoginCount: 0 } }
      );
    }
    await logPortalEvent(req, "login_failed", { user, meta: { reason: "wrong_password" } });
    throw invalidCredentials();
  }

  // Checked only after the password so a disabled account does not reveal itself
  if (!user.isActive) {
    await logPortalEvent(req, "login_blocked", { user, meta: { reason: "inactive" } });
    throw createError(403, "Your portal access has been disabled. Please contact GOEC.");
  }

  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  const station = await ChargingStation.findById(user.station, "name");
  const session = issueSession(req, res, user);
  await logPortalEvent(req, "login_success", { user });

  res.status(200).json({ success: true, data: { ...session, user: toPublicUser(user, station) } });
};

exports.refresh = async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) throw createError(401, "No session");

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch (error) {
    clearSession(req, res);
    throw error;
  }

  const user = await StationUser.findById(payload.sub);
  if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
    clearSession(req, res);
    throw createError(401, "Session is no longer valid");
  }

  // Rotates the refresh cookie too, so an active user stays signed in
  const session = issueSession(req, res, user);
  res.status(200).json({ success: true, data: session });
};

exports.logout = async (req, res) => {
  clearSession(req, res);
  res.status(200).json({ success: true, message: "Signed out" });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = validate(portalChangePasswordSchema, req.body);

  const user = await StationUser.findById(req.stationUser._id).select("+password");
  const match = await comparePassword(currentPassword, user.password);
  if (!match) throw createError(400, "Current password is incorrect");
  if (await comparePassword(newPassword, user.password)) {
    throw createError(400, "New password must be different from the current password");
  }

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  // Signs out every other session; this one gets fresh tokens below
  user.tokenVersion += 1;
  await user.save();

  const session = issueSession(req, res, user);
  await logPortalEvent(req, "password_changed", { user });

  res.status(200).json({ success: true, message: "Password updated", data: session });
};

exports.forgotPassword = async (req, res) => {
  const { email } = validate(portalForgotPasswordSchema, req.body);
  // Same response whether or not the account exists
  const genericResponse = {
    success: true,
    message: "If an account exists for this email, a reset code has been sent.",
  };

  const user = await StationUser.findOne({ email }).select("+resetOtpRequestedAt");
  if (!user || !user.isActive) {
    await logPortalEvent(req, "password_reset_requested", { meta: { email, reason: "no_active_account" } });
    return res.status(200).json(genericResponse);
  }

  if (user.resetOtpRequestedAt && Date.now() - user.resetOtpRequestedAt.getTime() < OTP_RESEND_INTERVAL_MS) {
    return res.status(200).json(genericResponse);
  }

  const otp = generateNumericOtp(6);
  await StationUser.updateOne(
    { _id: user._id },
    {
      $set: {
        resetOtpHash: hashOtp(otp),
        resetOtpExpiresAt: new Date(Date.now() + OTP_VALID_MINUTES * 60 * 1000),
        resetOtpRequestedAt: new Date(),
        resetOtpAttempts: 0,
      },
    }
  );

  try {
    await sendPortalOtpMail({ name: user.name, email: user.email, otp, validMinutes: OTP_VALID_MINUTES });
  } catch (error) {
    console.error("Failed to send portal reset code:", error.message);
  }
  await logPortalEvent(req, "password_reset_requested", { user });

  res.status(200).json(genericResponse);
};

exports.resetPassword = async (req, res) => {
  const { email, otp, newPassword } = validate(portalResetPasswordSchema, req.body);
  const invalidCode = () => createError(400, "Invalid or expired code");

  const user = await StationUser.findOne({ email }).select(
    "+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts"
  );
  if (!user || !user.isActive || !user.resetOtpHash || !user.resetOtpExpiresAt || user.resetOtpExpiresAt < new Date()) {
    throw invalidCode();
  }

  if (user.resetOtpAttempts >= MAX_OTP_ATTEMPTS) {
    await StationUser.updateOne({ _id: user._id }, { $unset: { resetOtpHash: 1, resetOtpExpiresAt: 1 } });
    throw invalidCode();
  }

  if (!otpMatches(otp, user.resetOtpHash)) {
    await StationUser.updateOne({ _id: user._id }, { $inc: { resetOtpAttempts: 1 } });
    await logPortalEvent(req, "password_reset_failed", { user });
    throw invalidCode();
  }

  user.password = await hashPassword(newPassword);
  user.mustChangePassword = false;
  user.tokenVersion += 1;
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  user.resetOtpHash = undefined;
  user.resetOtpExpiresAt = undefined;
  user.resetOtpAttempts = 0;
  await user.save();

  clearSession(req, res);
  await logPortalEvent(req, "password_reset", { user });

  res.status(200).json({ success: true, message: "Password has been reset. Please sign in." });
};

exports.getMe = async (req, res) => {
  const user = req.stationUser;

  const [station, chargers] = await Promise.all([
    ChargingStation.findById(user.station, "name address state district status latitude longitude"),
    EvMachine.find({ location_name: user.station }, "name CPID cpidStatus connectors.connectorId connectors.status")
      .sort({ name: 1 })
      .lean(),
  ]);

  res.status(200).json({
    success: true,
    data: {
      user: toPublicUser(user, station),
      station: station && {
        id: station._id,
        name: station.name,
        address: station.address,
        state: station.state,
        district: station.district,
        status: station.status,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      chargers: chargers.map((charger) => ({
        id: charger._id,
        name: charger.name,
        cpid: charger.CPID,
        status: charger.cpidStatus,
        connectors: (charger.connectors || []).map(({ connectorId, status }) => ({ connectorId, status })),
      })),
    },
  });
};
