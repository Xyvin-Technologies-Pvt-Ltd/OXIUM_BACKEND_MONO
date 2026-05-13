const userRoute = require("express").Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const asyncHandler = require("../../utils/asyncHandler");
const authVerify = require("../../middlewares/authVerify");
const requireAdminRole = require("../../middlewares/requireAdminRole");
const { otpLimiter, loginLimiter } = require("../../middlewares/rateLimiters");
const userCRUDController = require("../../controllers/user/userBasicCRUDControllers");
const userAuthController = require("../../controllers/user/userAuthController");
const userStationController = require("../../controllers/user/userStationController");
const userVehicleController = require("../../controllers/user/userVehicleController");
const userRFIDController = require("../../controllers/user/userRFIDController");
const userController = require('../../controllers/user/userController')
const { validateBody } = require("../../middlewares/validateRequest")
const { adminCreateUserSchema } = require("../../validation")

//!user basic CRUD controller
userRoute.post(
  "/users/user",
  authVerify,
  requireAdminRole,
  validateBody(adminCreateUserSchema),
  asyncHandler(userCRUDController.createUser)
);
userRoute.get(
  "/users/list",
  authVerify,
  asyncHandler(userCRUDController.getUserList)
);
userRoute.get(
  "/users/user/:userId",
  authVerify,
  asyncHandler(userCRUDController.getUserById)
);
userRoute.put(
  "/users/:userId",
  authVerify,
  asyncHandler(userCRUDController.updateUser)
);
userRoute.delete(
  "/users/:userId",
  authVerify,
  asyncHandler(userCRUDController.deleteUser)
);
userRoute.get(
  "/users/user/byMobileNo/:mobileNo",
  authVerify,
  asyncHandler(userCRUDController.getUserByMobileNo)
);
userRoute.put(
  "/users/update/byMobileNo/:mobileNo",
  authVerify,
  asyncHandler(userCRUDController.updateUserByMobileNo)
);
userRoute.post(
  "/image/upload",
  upload.single("image"),
  asyncHandler(userCRUDController.imageUpload)
);

//!user Auth related

userRoute.get(
  "/users/sendOtp/:mobileNo",
  otpLimiter,
  asyncHandler(userAuthController.sendOtp)
);
userRoute.put(
  "/users/login/:mobileNo",
  loginLimiter,
  asyncHandler(userAuthController.login)
);
userRoute.get(
  "/users/transaction/rfid-authenticate/:rfid",
  authVerify,
  asyncHandler(userAuthController.rfidAuthenticate)
);
userRoute.get(
  "/users/transaction/authenticate/:userid",
  authVerify,
  asyncHandler(userAuthController.userAuthenticate)
);
userRoute.get(
  "/users/transaction/authenticate/byId/:userId",
  authVerify,
  asyncHandler(userAuthController.userAuthenticateById)
);
userRoute.get(
  "/users/getFirebaseId/:userId",
  authVerify,
  asyncHandler(userAuthController.firebaseId)
);
userRoute.put(
  "/users/updateFirebaseId/:userId",
  authVerify,
  asyncHandler(userAuthController.updateFirebaseId)
);

//!add and delete favorites
userRoute.put(
  "/users/addFavoriteStation/:userId",
  authVerify,
  asyncHandler(userStationController.addFavoriteStation)
);
userRoute.put(
  "/users/removeFavoriteStation/:userId",
  authVerify,
  asyncHandler(userStationController.removeFavoriteStation)
);

//!vehicle related
userRoute.put(
  "/users/addVehicle/:userId",
  authVerify,
  asyncHandler(userVehicleController.addVehicle)
);
userRoute.put(
  "/users/removeVehicle/:userId",
  authVerify,
  asyncHandler(userVehicleController.removeVehicle)
);
userRoute.get(
  "/users/vehicleList/:userId",
  authVerify,
  asyncHandler(userVehicleController.getUserVehicles)
);
userRoute.put(
  "/users/updateDefaultVehicle/:userId",
  authVerify,
  asyncHandler(userVehicleController.updateUserDefaultVehicle)
);

//! rfidTag related
userRoute.put(
  "/users/addRfidTag/:userId",
  authVerify,
  asyncHandler(userRFIDController.addRfidTag)
);
userRoute.put(
  "/users/removeRfidTag/:userId",
  authVerify,
  asyncHandler(userRFIDController.removeRfidTag)
);
userRoute.put(
  "/users/removeRfidTagById/:rfidTagId",
  authVerify,
  asyncHandler(userRFIDController.removeRfidTagById)
);

//!Wallet
userRoute.put(
  "/users/addToWallet/:userId",
  authVerify,
  asyncHandler(userController.addToWallet)
);
userRoute.put(
  "/users/deductFromWallet/:userId",
  authVerify,
  asyncHandler(userController.deductFromWallet)
);

userRoute.put(
  "/users/transaction/increaseSessions",
  authVerify,
  asyncHandler(userController.userUpdateSession)
);
userRoute.get(
  "/users/getChargingTariff/fromRfid/:rfId",
  authVerify,
  asyncHandler(userController.getChargingTariffByRfid)
);

module.exports = userRoute;
