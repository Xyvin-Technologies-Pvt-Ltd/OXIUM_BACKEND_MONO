const PortalAuditLog = require("../models/portalAuditLogSchema");

const clientIp = (req) =>
  (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip;

// Best effort: an audit write failing must never fail the request itself.
const logPortalEvent = async (req, action, { user, meta } = {}) => {
  try {
    await PortalAuditLog.create({
      stationUser: user?._id,
      station: user?.station,
      action,
      ip: clientIp(req),
      userAgent: req.headers["user-agent"],
      meta,
    });
  } catch (error) {
    console.error("Failed to write portal audit log:", error.message);
  }
};

module.exports = { logPortalEvent };
