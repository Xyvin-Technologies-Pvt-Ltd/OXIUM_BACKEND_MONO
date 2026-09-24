const createError = require("http-errors");
const StationUser = require("../models/stationUserSchema");
const { verifyAccessToken } = require("../utils/portalTokens");

// Authenticates a station portal user. The user is re-read from the database on every
// request so deactivation or a password reset takes effect immediately.
//
// req.stationId is the ONLY source of the station for portal queries. Never read a
// station/location id from the request.
const portalAuth = async (req, res, next) => {
  try {
    const header = req.headers["authorization"] || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) {
      throw createError(401, "No token provided");
    }

    const payload = verifyAccessToken(token);

    const user = await StationUser.findById(payload.sub);
    if (!user || !user.isActive || user.tokenVersion !== payload.ver) {
      throw createError(401, "Session is no longer valid");
    }

    req.stationUser = user;
    req.stationId = user.station;
    return next();
  } catch (error) {
    return next(error);
  }
};

// For data endpoints: a user signed in with an admin-issued temporary password must
// set their own password first.
const requirePasswordChanged = (req, res, next) => {
  if (req.stationUser?.mustChangePassword) {
    return next(createError(403, "Password change required", { code: "PASSWORD_CHANGE_REQUIRED" }));
  }
  return next();
};

module.exports = { portalAuth, requirePasswordChanged };
