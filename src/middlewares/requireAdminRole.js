const Role = require("../models/rolesSchema");

async function requireAdminRoleInner(req, res, next) {
  if (req.role === "user") {
    return res.status(403).json({
      success: false,
      message: "Forbidden: admin role required",
    });
  }

  let roleDoc = req.roleDoc;
  if (!roleDoc && req.roleId) {
    roleDoc = await Role.findById(req.roleId)
      .select("location_access role_name")
      .lean()
      .exec();
  }
  if (!roleDoc && req.role) {
    roleDoc = await Role.findOne({ role_name: req.role })
      .select("location_access role_name")
      .lean()
      .exec();
  }

  if (!roleDoc) {
    return res.status(403).json({
      success: false,
      message: "Forbidden: missing role credentials",
    });
  }

  req.roleDoc = roleDoc;
  return next();
}

module.exports = (req, res, next) =>
  Promise.resolve(requireAdminRoleInner(req, res, next)).catch(next);
