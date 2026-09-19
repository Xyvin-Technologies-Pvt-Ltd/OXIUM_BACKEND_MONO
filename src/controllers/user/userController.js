const createError = require("http-errors");
const USER = require("../../models/userSchema");
const {
  createWalletTransaction,
} = require("../transaction/transactionController");
const { getConfigByName } = require("../configuration/configurationController");
const {
  getChargingTariffById,
} = require("../configuration/chargingTariffController");
const { getRfidBySerialNumber } = require("../rfid/rfidController");

// Get charging tariff by ID
exports.getChargingTariffByRfid = async (req, res) => {
  const idOrRfid = req.params.rfId;
  let chargingTariffApiResult = {};
  if (idOrRfid.length == 10) {
    const user = await USER.findOne({ userId: idOrRfid }, "chargingTariff");

    if (user.chargingTariff) {
      req.params.id = user.chargingTariff;
      let apiResponse = await getChargingTariffById(req, res, true);
      chargingTariffApiResult = apiResponse;
    }

    res.status(200).json({
      status: true,
      message: "Ok",
      result: {
        _id: user._id,
        value: chargingTariffApiResult.value,
        tax: chargingTariffApiResult.tax,
        serviceAmount: chargingTariffApiResult.serviceAmount,
        energyRate: chargingTariffApiResult.energyRate,
        chargingTariffTotal: chargingTariffApiResult.total,
        chargingTariff: chargingTariffApiResult.energyRate,
        total: chargingTariffApiResult.energyRate,
      },
    });
  } else {
    req.params.rfidSerialNumber = idOrRfid;
    let rfidMongoId = await getRfidBySerialNumber(req, res, true);
    if (!rfidMongoId) throw new createError(400, "No Mongo Id");

    let rfidId = rfidMongoId._id;
    const user = await USER.findOne({ rfidTag: rfidId }, "chargingTariff");
    if (!user) throw new createError(400, "rfid not found");

    if (user.chargingTariff) {
      req.params.id = user.chargingTariff;
      let apiResponse = await getChargingTariffById(req, res, true);
      chargingTariffApiResult = apiResponse;
    }

    res.status(200).json({
      status: true,
      message: "Ok",
      result: {
        _id: user._id,
        value: chargingTariffApiResult.value,
        tax: chargingTariffApiResult.tax,
        serviceAmount: chargingTariffApiResult.serviceAmount,
        energyRate: chargingTariffApiResult.energyRate,
        chargingTariffTotal: chargingTariffApiResult.total,
        chargingTariff: chargingTariffApiResult.energyRate,
        total: chargingTariffApiResult.energyRate,
      },
    });
  }
};

// add a favorite station

// add money to wallet
exports.addToWallet = async (req, res, internalCall = false) => {
  if (!req.body.amount)
    throw new createError(404, `amount is a required field`);
  else if (isNaN(req.body.amount) || req.body.amount == 0)
    throw new createError(404, `invalid amount`);

  const user = req.params.userId;
  const amount = req.body.amount;
  const doneByAdmin = req.body.doneByAdmin;
  const reference = req.body.reference;
  const actionType = req.body.type;

  const updatedUser = await USER.findByIdAndUpdate(
    user,
    { $inc: { wallet: amount } },
    { new: true }
  );
  if (!updatedUser) {
    res.status(404).json({ status: false, message: "User not found" });
  } else {
    if (doneByAdmin) {
      const payload = {
        user: user,
        amount: amount,
        type: actionType,
        status: "success",
        reference: reference,
        initiated_by: "admin",
        userWalletUpdated: true,
      };
      req.body = payload;
      await createWalletTransaction(req, res, true);
    }
    const result = updatedUser;
      if (internalCall === true) return result;
    res.status(200).json({ status: true, message: "Ok", result });
  }
};

// deduct money from wallet
exports.deductFromWallet = async (req, res) => {
  req.params.name = "minimum-transaction-wallet-requirement";
  const minimumWalletRequirement = await getConfigByName(req, res, true);
  if (!req.body.amount)
    throw new createError(404, `amount is a required field`);
  else if (isNaN(req.body.amount) || req.body.amount <= 0)
    throw new createError(404, `invalid amount`);

  const userId = req.params.userId;
  const amount = req.body.amount;
  const unitsUsed = req.body.unitsUsed;
  const doneByAdmin = req.body.doneByAdmin;
  const reference = req.body.reference;

  const user = await USER.findById(userId, "wallet");
  if (!user) res.status(404).json({ status: false, message: "User not found" });

  let walletAmount = user.wallet;
  if (walletAmount < Number(amount) + Number(minimumWalletRequirement))
    throw new createError(404, `amount exceeds remaining wallet amount`);

  let newWalletAmount = walletAmount - amount;
  let updateBody = {
    $set: { wallet: newWalletAmount },
  };
  if (unitsUsed) updateBody["$inc"] = { total_units: unitsUsed };

  const updatedUser = await USER.findByIdAndUpdate(userId, updateBody, {
    new: true,
  });

  if (doneByAdmin && updatedUser) {
    const payload = {
      user: user,
      amount: amount,
      type: type,
      status: "success",
      reference: reference,
      initiated_by: "admin",
      userWalletUpdated: "admin deduction",
    };
    req.body = payload;
    await createWalletTransaction(req, res, true);
  }

  res.status(200).json({
    status: true,
    message: "Ok",
    result: { walletAmount: updatedUser.wallet },
  });
};

// Update a user sessions and units
exports.userUpdateSession = async (req, res) => {
  const { userId, unitsConsumed } = req.body;

  const updatedUser = await USER.findByIdAndUpdate(
    userId,
    {
      $inc: {
        // total_units: unitsConsumed,
        total_sessions: 1,
      },
    },
    { new: true }
  );
  if (!updatedUser) {
    res.status(404).json({ status: false, message: "User not found" });
  } else {
    res.status(200).json({ status: true, message: "Ok", result: updatedUser });
  }
};
