const mongoose = require("mongoose");
const moment = require("moment");
const Admin = require("../../models/adminSchema");
const { comparePassword, hashPassword } = require("../../utils/hashPassword");
const { signAccessToken } = require("../../utils/jwt_helper");
const Role = require("../../models/rolesSchema");
const {
  generateRandomPassword,
} = require("../../utils/generateRandomPassword");
const User = require("../../models/userSchema");
const {
  getUserListPipeline,
  getUserDataByIdPipeline,
  getUserDataByPhoneOrEmailPipeline,
  getFavoriteStationsPipeline,
  getChargingTariffPipeline,
  getVehicleDetailsPipeline,
  getRfidDetailsPipeline,
} = require("./pipes");
const { sendMailToAdmin } = require("../notification/emailController");

exports.adminSignIn = async (req, res) => {
  const { email, password } = req.body;

  const user = await Admin.findOne({ email: email.trim() }).populate("role");
  if (!user)
    return res.status(400).json({ status: false, error: "User not found" });

  const match = await comparePassword(password, user.password);
  if (!match)
    return res.status(400).json({ status: false, error: "Invalid password" });
  let token = await signAccessToken(user._id.toString(), user.role, email.trim());
  res.status(200).json({ success: true, token: token });
};

//role
exports.createRole = async (req, res) => {
  const {
    roleName,
    roleDescription,
    isActive,
    functionalPermissions,
    locationalPermissions,
  } = req.body;

  const permissions = transformFunctionalPermissions(functionalPermissions);
  const location_access = transformLocationalPermissions(locationalPermissions);
  const newRole = new Role({
    role_name: roleName,
    description: roleDescription,
    isActive: isActive,
    permissions,
    location_access,
  });
  const savedRole = await newRole.save();
  res.status(201).json(savedRole);
};

exports.getRole = async (req, res) => {
  let roleData = await Role.find();

  const formattedData = roleData.map((role) => {
    let accessType;
    if (
      role.location_access &&
      role.location_access.length > 0 &&
      role.permissions &&
      role.permissions.length > 0
    ) {
      accessType = "location access, functional access";
    } else if (role.location_access && role.location_access.length > 0) {
      accessType = "location access";
    } else if (role.permissions && role.permissions.length > 0) {
      accessType = "functional access";
    } else {
      accessType = "no access";
    }
    return {
      _id: role._id,
      roleName: role.role_name,
      createdOn: new Date(role.createdAt).toLocaleString(),
      accessType: accessType,
      locationAccess: role.location_access,
      permissions: role.permissions,
      description: role.description,
      status: role.isActive ? "Active" : "Inactive",
    };
  });
  res.status(200).json({ status: true, result: formattedData });
};

exports.updateRole = async (req, res) => {
  const { id } = req.params;
  const {
    roleName,
    roleDescription,
    isActive,
    functionalPermissions,
    locationalPermissions,
  } = req.body;
  const permissions = transformFunctionalPermissions(functionalPermissions);
  const location_access = transformLocationalPermissions(locationalPermissions);

  const updatedRole = await Role.findByIdAndUpdate(
    id,
    {
      role_name: roleName,
      description: roleDescription,
      isActive,
      permissions,
      location_access,
    },
    { new: true }
  );

  res.status(200).json({ success: true, data: updatedRole });
};

exports.pushRole = async (req, res, internalCall = false) => {
  const { id } = req.params;
  const { location_access } = req.body;

  try {
    const updatedRole = await Role.findByIdAndUpdate(
      id,
      {
        $push: { location_access: location_access },
      },
      { new: true }
    );
    const data = updatedRole;
    if (internalCall === true) return data;
    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.popRole = async (req, res) => {
  const { id } = req.params;
  const { location_access } = req.body;

  try {
    const updatedRole = await Role.findByIdAndUpdate(
      id,
      {
        $pull: { location_access: location_access },
      },
      { new: true }
    );

    res.status(200).json({ success: true, data: updatedRole });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteRole = async (req, res) => {
  const { id } = req.params;
  const deletedRole = await Role.findByIdAndDelete(id);
  res.status(200).json({ message: "Role successfully deleted", status: true });
};

exports.getRoleById = async (req, res) => {
  let { id } = req.params;

  let roleData = await Role.findById(id);

  if (!roleData) {
    return res.status(404).json({ status: false, message: "Role not found" });
  }

  let accessType;
  if (
    roleData.location_access &&
    roleData.location_access.length > 0 &&
    roleData.permissions &&
    roleData.permissions.length > 0
  ) {
    accessType = "location access, functional access";
  } else if (roleData.location_access && roleData.location_access.length > 0) {
    accessType = "location access";
  } else if (roleData.permissions && roleData.permissions.length > 0) {
    accessType = "functional access";
  } else {
    accessType = "no access";
  }

  const formattedData = {
    _id: roleData._id,
    roleName: roleData.role_name,
    createdOn: new Date(roleData.createdAt).toLocaleString(),
    accessType: accessType,
    locationAccess: roleData.location_access,
    permissions: roleData.permissions,
    description: roleData.description,
    status: roleData.isActive ? "Active" : "Inactive",
  };

  res.status(200).json({ status: true, result: formattedData });
};

exports.createAdmin = async (req, res) => {
  const { name, designation, email, mobile, role, status } = req.body;

  const initialPassword = generateRandomPassword();
  const hashedPassword = await hashPassword(initialPassword);
  //send mail to admin
  let package = {
    name: name,
    email: email,
    designation: designation,
    password: initialPassword,
  };
  req.body = package;
  await sendMailToAdmin(req, res, true);

  const newAdmin = new Admin({
    name: name,
    designation: designation,
    email: email,
    password: hashedPassword,
    mobile: mobile,
    role: role,
    status: status,
  });
  const savedAdmin = await newAdmin.save();
  res.status(201).json(savedAdmin);
};

exports.getAdmin = async (req, res) => {
  const { pageNo } = req.query;

  let adminData = await Admin.find()
    .populate("role")
    .skip(10 * (pageNo - 1))
    .limit(10);
  let totalCount = await Admin.countDocuments();

  const formattedData = adminData.map((role) => {
    return {
      _id: role._id,
      name: role.name,
      role: role.role?.role_name,
      email: role.email,
      phone: role.mobile,
      designation: role.designation,
      status: role.status ? "Active" : "Inactive",
    };
  });

  res.status(200).json({ status: true, result: formattedData, totalCount });
};

exports.updateAdmin = async (req, res) => {
  const { id } = req.params;
  const { name, designation, email, mobile, role, status } = req.body;

  await Admin.findByIdAndUpdate(
    id,
    {
      name,
      designation,
      email,
      mobile,
      role,
      status,
    },
    { new: true }
  );

  res.status(200).json({ status: true, message: "updated successfully" });
};

exports.deleteAdmin = async (req, res) => {
  const { id } = req.params;
  await Admin.findByIdAndDelete(id);

  return res
    .status(200)
    .json({ status: true, message: "Deleted Successfully" });
};

//list
exports.userList = async (req, res) => {
  const { pageNo, searchQuery } = req.query;

  const filter = {};

  if (searchQuery) {
    filter.$or = [
      { username: { $regex: searchQuery, $options: "i" } },
      { email: { $regex: searchQuery, $options: "i" } },
      { mobile: { $regex: searchQuery, $options: "i" } },
    ];
  }

  try {
    const pipedData = await User.aggregate(getUserListPipeline(filter))
      .skip(10 * (pageNo - 1))
      .limit(10);

    const totalCount = await User.find(filter).countDocuments();

    res
      .status(200)
      .json({ status: true, message: "Ok", result: pipedData, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.userDataById = async (req, res) => {
  const id = req.params.id;

  try {
    const pipedData = await User.aggregate(getUserDataByIdPipeline(id));
    const user = pipedData[0];

    if (!user) {
      res.status(404).json({ status: false, message: "User not found" });
    } else {
      res.status(200).json({ status: true, message: "Ok", result: user });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.userDatabyPhoneOrEmail = async (req, res) => {
  const { email, phoneNumber } = req.query;
  console.log(
    "🚀 ~ exports.userDatabyPhoneOrEmail= ~ phoneNumber:",
    phoneNumber
  );

  if (!email && !phoneNumber) {
    return res
      .status(400)
      .json({ error: "Please provide either email or phoneNumber parameter" });
  }

  const query = {};
  if (email) {
    query.email = email;
  }
  if (phoneNumber) {
    query.mobile = "+" + phoneNumber.trim();
  }

  try {
    const user = await User.findOne(query, "username mobile email rfidTag");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const pipedData = await User.aggregate(
      getUserDataByPhoneOrEmailPipeline(query)
    );

    res.json({ message: "OK", success: true, result: pipedData });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", message: error.message });
  }
};

exports.favoriteStations = async (req, res) => {
  const { pageNo } = req.query;
  const id = req.params.id;

  try {
    const pipedData = await User.aggregate(
      getFavoriteStationsPipeline(id, pageNo)
    );
    const totalCount = await User.find({
      _id: new mongoose.Types.ObjectId(id),
    }).countDocuments();

    res
      .status(200)
      .json({ status: true, message: "Ok", result: pipedData, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.chargingTariff = async (req, res) => {
  const id = req.params.id;

  try {
    const user = await User.aggregate(getChargingTariffPipeline(id));

    if (!user.length) {
      res.status(404).json({ status: false, message: "User not found" });
    } else {
      res
        .status(200)
        .json({ status: true, message: "Ok", result: user[0] || null });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.vehicleDetails = async (req, res) => {
  const id = req.params.id;

  try {
    const result = await User.aggregate(getVehicleDetailsPipeline(id));

    if (!result.length) {
      res.status(404).json({ status: false, message: "User not found" });
    } else {
      res.status(200).json({ status: true, message: "Ok", result });
    }
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

exports.rfidDetails = async (req, res) => {
  const { pageNo } = req.query;
  const id = req.params.id;

  try {
    const result = await User.aggregate(getRfidDetailsPipeline(id, pageNo));

    const totalCount = await User.find({
      _id: new mongoose.Types.ObjectId(id),
    }).countDocuments();

    const final = result.map((item) => ({
      rfidTag: item.rfidTag || "unavailable",
      createdOn: moment(item.createdAt).format("DD-MM-YYYY") || "unavailable",
      expiry: moment(item.expiry).format("DD-MM-YYYY") || "unavailable",
      serialNumber: item.serialNumber || "unavailable",
      status: item.status || "unavailable",
      id: item._id || "unavailable",
      rfidType: item.rfidType || "no type",
    }));

    res
      .status(200)
      .json({ status: true, message: "Ok", result: final, totalCount });
  } catch (error) {
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

//Chargingtariff
exports.assignUnassignChargingTariff = async (req, res) => {
  const userId = req.params.userId;
  const chargingTariff = req.body.chargingTariff;

  const updateOperation = chargingTariff
    ? { $set: { chargingTariff } }
    : { $unset: { chargingTariff: "" } };

  const updatedUser = await User.findByIdAndUpdate(userId, updateOperation, {
    new: true,
  });

  if (!updatedUser) {
    res.status(404).json({ status: false, message: "User not found" });
  } else {
    res.status(200).json({
      status: true,
      message: "Ok",
      result: updatedUser.chargingTariff,
    });
  }
};

//Chargingtariff
exports.suggestions = async (req, res) => {
  const { query } = req.query;

  const users = await User.find(
    {
      $or: [
        { username: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } },
        { mobile: { $regex: query, $options: "i" } },
      ],
    },
    { username: 1, mobile: 1, email: 1, _id: 1, firebaseToken: 1 }
  );

  res.status(200).json({ status: true, result: users, message: "ok" });
};

const transformFunctionalPermissions = (functionalPermissions) => {
  return functionalPermissions.reduce((acc, { functionName, view, modify }) => {
    if (view) acc.push(`${functionName}_view`);
    if (modify) acc.push(`${functionName}_modify`);
    return acc;
  }, []);
};

const transformLocationalPermissions = (locationalPermissions) => {
  return locationalPermissions.map(({ value }) => value);
};
