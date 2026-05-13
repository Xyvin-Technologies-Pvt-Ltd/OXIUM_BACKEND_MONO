const jwt = require("jsonwebtoken");
const Role = require("../models/rolesSchema");

async function authVerifyInner(req, res, next) {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  const header = req.headers.authorization;

  const jwt_token = header && header.split(" ")[1];

  if (!jwt_token) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(jwt_token, secret);

    req.role = decoded.role;
    req.userId = decoded.userId;
    req.roleId = decoded.roleId;

    if (decoded.roleId) {
      req.roleDoc = await Role.findById(decoded.roleId)
        .select("location_access role_name")
        .lean()
        .exec();
    }

    return next();
  } catch (_err) {
    return res.status(403).json({ message: "Failed to authenticate token" });
  }
}

module.exports = (req, res, next) =>
  Promise.resolve(authVerifyInner(req, res, next)).catch(next);
