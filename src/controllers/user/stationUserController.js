const mongoose = require("mongoose");
const createError = require("http-errors");
const StationUser = require("../../models/stationUserSchema");
const ChargingStation = require("../../models/chargingStationSchema");
const { hashPassword } = require("../../utils/hashPassword");
const { generateSecurePassword } = require("../../utils/generateSecurePassword");
const { hasStationAccess } = require("../../middlewares/requirePermission");
const { sendPortalCredentialsMail } = require("../../helpers/portalMails");
const { logPortalEvent } = require("../../helpers/portalAudit");
const {
  stationUserCreateSchema,
  stationUserUpdateSchema,
  stationUserListQuerySchema,
} = require("../../validation");

// CMS management of station portal users. Mounted under /admin with authVerify +
// requirePermission, so req.adminRole is the caller's fresh role.

function validate(schema, data) {
  const { error, value } = schema.validate(data, { stripUnknown: true });
  if (error) {
    throw createError(400, error.details.map((detail) => detail.message).join(", "));
  }
  return value;
}

const assertObjectId = (id, label) => {
  if (!mongoose.Types.ObjectId.isValid(id)) throw createError(400, `Invalid ${label} id`);
};

const assertStationAccess = (req, stationId) => {
  if (!hasStationAccess(req.adminRole, stationId)) {
    throw createError(403, "You do not have access to this station");
  }
};

const adminId = (req) => req.userId?._id || req.userId;

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatStationUser = (user, station = user.station) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  mobile: user.mobile,
  isActive: user.isActive,
  status: user.isActive ? "Active" : "Inactive",
  isLocked: !!(user.lockedUntil && user.lockedUntil > new Date()),
  mustChangePassword: user.mustChangePassword,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  station: station && station._id ? { _id: station._id, name: station.name } : { _id: station },
});

const duplicateError = (error) => {
  const field = Object.keys(error.keyPattern || {})[0];
  return createError(
    409,
    field === "station"
      ? "This station already has a portal user"
      : "This email is already used by another portal user"
  );
};

async function sendCredentials(user, station, password, isReset) {
  try {
    await sendPortalCredentialsMail({
      name: user.name,
      email: user.email,
      password,
      stationName: station?.name || "your station",
      isReset,
    });
    return true;
  } catch (error) {
    console.error("Failed to send station portal credentials:", error.message);
    return false;
  }
}

async function loadAccessibleUser(req) {
  assertObjectId(req.params.id, "portal user");
  const user = await StationUser.findById(req.params.id);
  if (!user) throw createError(404, "Portal user not found");
  assertStationAccess(req, user.station);
  return user;
}

exports.listStationUsers = async (req, res) => {
  const { pageNo, limit, search } = validate(stationUserListQuerySchema, req.query);

  const filter = {};
  const access = req.adminRole.location_access || [];
  if (!access.includes("all")) {
    filter.station = { $in: access.filter((id) => mongoose.Types.ObjectId.isValid(id)) };
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ name: pattern }, { email: pattern }, { mobile: pattern }];
  }

  const [users, totalCount] = await Promise.all([
    StationUser.find(filter)
      .populate("station", "name")
      .sort({ createdAt: -1 })
      .skip(limit * (pageNo - 1))
      .limit(limit),
    StationUser.countDocuments(filter),
  ]);

  res.status(200).json({ status: true, result: users.map((user) => formatStationUser(user)), totalCount });
};

// Used by the station detail page: result is null when the station has no portal user yet
exports.getStationUserByStation = async (req, res) => {
  const { stationId } = req.params;
  assertObjectId(stationId, "station");
  assertStationAccess(req, stationId);

  const user = await StationUser.findOne({ station: stationId }).populate("station", "name");
  res.status(200).json({ status: true, result: user ? formatStationUser(user) : null });
};

exports.createStationUser = async (req, res) => {
  const value = validate(stationUserCreateSchema, req.body);
  assertStationAccess(req, value.station);

  const station = await ChargingStation.findById(value.station, "name");
  if (!station) throw createError(404, "Charging station not found");

  const tempPassword = generateSecurePassword();
  let user;
  try {
    user = await StationUser.create({
      ...value,
      password: await hashPassword(tempPassword),
      mustChangePassword: true,
      createdBy: adminId(req),
    });
  } catch (error) {
    if (error.code === 11000) throw duplicateError(error);
    throw error;
  }

  const emailSent = await sendCredentials(user, station, tempPassword, false);
  await logPortalEvent(req, "admin_created_user", { user, meta: { by: adminId(req), emailSent } });

  res.status(201).json({ status: true, result: formatStationUser(user, station), emailSent });
};

exports.updateStationUser = async (req, res) => {
  const value = validate(stationUserUpdateSchema, req.body);
  const user = await loadAccessibleUser(req);

  const deactivating = value.isActive === false && user.isActive;
  Object.assign(user, value);
  if (deactivating) user.tokenVersion += 1; // ends any open portal session immediately

  try {
    await user.save();
  } catch (error) {
    if (error.code === 11000) throw duplicateError(error);
    throw error;
  }

  await user.populate("station", "name");
  await logPortalEvent(req, "admin_updated_user", {
    user: { _id: user._id, station: user.station._id },
    meta: { by: adminId(req), fields: Object.keys(value) },
  });

  res.status(200).json({ status: true, result: formatStationUser(user) });
};

exports.resetStationUserPassword = async (req, res) => {
  const user = await loadAccessibleUser(req);

  const tempPassword = generateSecurePassword();
  user.password = await hashPassword(tempPassword);
  user.mustChangePassword = true;
  user.tokenVersion += 1;
  user.failedLoginCount = 0;
  user.lockedUntil = undefined;
  await user.save();

  const station = await ChargingStation.findById(user.station, "name");
  const emailSent = await sendCredentials(user, station, tempPassword, true);
  await logPortalEvent(req, "admin_reset_password", { user, meta: { by: adminId(req), emailSent } });

  res.status(200).json({ status: true, result: formatStationUser(user, station), emailSent });
};

exports.deleteStationUser = async (req, res) => {
  const user = await loadAccessibleUser(req);
  await StationUser.deleteOne({ _id: user._id });
  await logPortalEvent(req, "admin_deleted_user", { user, meta: { by: adminId(req), email: user.email } });

  res.status(200).json({ status: true, message: "Portal user deleted" });
};
