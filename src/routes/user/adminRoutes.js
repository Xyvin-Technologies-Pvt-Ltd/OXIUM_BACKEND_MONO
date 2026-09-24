const adminRoute = require("express").Router();
const adminController = require("../../controllers/user/adminController");
const authVerify = require("../../middlewares/authVerify");
const asyncHandler = require("../../utils/asyncHandler");
const stationUserController = require("../../controllers/user/stationUserController");
const { requirePermission } = require("../../middlewares/requirePermission");

// Create a new admins and roles
adminRoute.post("/admin-signin", asyncHandler(adminController.adminSignIn));

//roles
adminRoute.post(
  "/role/create",
  authVerify,
  asyncHandler(adminController.createRole)
);
adminRoute.get("/role/list", authVerify, asyncHandler(adminController.getRole));
adminRoute.put(
  "/role/:id",
  authVerify,
  asyncHandler(adminController.updateRole)
);
adminRoute.put(
  "/pushrole/:id",
  authVerify,
  asyncHandler(adminController.pushRole)
);
adminRoute.put(
  "/poprole/:id",
  authVerify,
  asyncHandler(adminController.popRole)
);
adminRoute.delete(
  "/role/:id",
  authVerify,
  asyncHandler(adminController.deleteRole)
);
adminRoute.get(
  "/role/:id",
  authVerify,
  asyncHandler(adminController.getRoleById)
);

//admins
adminRoute.post(
  "/admin/create",
  authVerify,
  asyncHandler(adminController.createAdmin)
);
adminRoute.get(
  "/admin/list",
  authVerify,
  asyncHandler(adminController.getAdmin)
);
adminRoute.put(
  "/admin/:id",
  authVerify,
  asyncHandler(adminController.updateAdmin)
);
adminRoute.delete(
  "/admin/:id",
  authVerify,
  asyncHandler(adminController.deleteAdmin)
);

//station portal users
adminRoute.get(
  "/station-users",
  authVerify,
  requirePermission("adminManagement_view"),
  asyncHandler(stationUserController.listStationUsers)
);
adminRoute.get(
  "/station-users/station/:stationId",
  authVerify,
  requirePermission("adminManagement_view"),
  asyncHandler(stationUserController.getStationUserByStation)
);
adminRoute.post(
  "/station-users",
  authVerify,
  requirePermission("adminManagement_modify"),
  asyncHandler(stationUserController.createStationUser)
);
adminRoute.put(
  "/station-users/:id",
  authVerify,
  requirePermission("adminManagement_modify"),
  asyncHandler(stationUserController.updateStationUser)
);
adminRoute.post(
  "/station-users/:id/reset-password",
  authVerify,
  requirePermission("adminManagement_modify"),
  asyncHandler(stationUserController.resetStationUserPassword)
);
adminRoute.delete(
  "/station-users/:id",
  authVerify,
  requirePermission("adminManagement_modify"),
  asyncHandler(stationUserController.deleteStationUser)
);

adminRoute.get("/userList", authVerify, asyncHandler(adminController.userList));
adminRoute.get(
  "/userDatabyId/:id",
  authVerify,
  asyncHandler(adminController.userDataById)
);
adminRoute.get(
  "/userDatabyPhoneOrEmail",
  authVerify,
  asyncHandler(adminController.userDatabyPhoneOrEmail)
);
adminRoute.get(
  "/favoriteStations/:id",
  authVerify,
  asyncHandler(adminController.favoriteStations)
);
adminRoute.get(
  "/chargingTariff/:id",
  authVerify,
  asyncHandler(adminController.chargingTariff)
);
adminRoute.get(
  "/vehicleDetails/:id",
  authVerify,
  asyncHandler(adminController.vehicleDetails)
);
adminRoute.get(
  "/rfidDetails/:id",
  authVerify,
  asyncHandler(adminController.rfidDetails)
);

//chargingTariff
adminRoute.put(
  "/assignUnassignChargingTariff/:userId",
  authVerify,
  asyncHandler(adminController.assignUnassignChargingTariff)
);

adminRoute.get(
  "/suggestions",
  authVerify,
  asyncHandler(adminController.suggestions)
);

module.exports = adminRoute;
