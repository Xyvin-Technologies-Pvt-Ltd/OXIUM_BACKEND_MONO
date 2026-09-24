const createError = require("http-errors");
const Role = require("../models/rolesSchema");

// Use after authVerify. The role embedded in the CMS token can be stale (tokens last a
// year), so the role is loaded fresh. It is exposed as req.adminRole for location checks.
const requirePermission = (permission) => async (req, res, next) => {
  try {
    const roleId = req.role?._id || req.role;
    const role = roleId ? await Role.findById(roleId, "permissions location_access isActive") : null;

    if (!role || role.isActive === false || !(role.permissions || []).includes(permission)) {
      throw createError(403, "You do not have permission to perform this action");
    }

    req.adminRole = role;
    return next();
  } catch (error) {
    return next(error);
  }
};

// location_access is either ['all'] or a list of ChargingStation ids.
const hasStationAccess = (role, stationId) => {
  const access = (role && role.location_access) || [];
  return access.includes("all") || access.some((id) => String(id) === String(stationId));
};

module.exports = { requirePermission, hasStationAccess };
