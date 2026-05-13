const Joi = require("joi");

// Joi schema for the main vehicle
const vehicleValidationSchema = Joi.object({
  modelName: Joi.string().required(),
  numberOfPorts: Joi.number(),
  icon: Joi.string().required(),
  brand: Joi.string(),
  compactable_port: Joi.array(),
});

const reviewEditSchema = Joi.object({
  // user: Joi.string(),
  chargingStation: Joi.string(),
  evMachine: Joi.string(),
  rating: Joi.number().min(0).max(5),
  comment: Joi.string(),
});

const taxValidationSchema = Joi.object({
  name: Joi.string().required(),
  percentage: Joi.number().required(),
  status: Joi.boolean().required(),
});

const chargingTariffValidationSchema = Joi.object({
  name: Joi.string().disallow("Default").required(),
  tariffType: Joi.string().valid("energy", "time"),
  value: Joi.number().required(),
  serviceAmount: Joi.number().required(),
  tax: Joi.string().required(),
});

const chargingTariffUpdateValidationSchema = Joi.object({
  name: Joi.string().disallow("Default"),
  tariffType: Joi.string().valid("energy", "time"),
  value: Joi.number(),
  serviceAmount: Joi.number(),
  tax: Joi.string(),
});

const chargingTariffDefaultValidationSchema = Joi.object({
  value: Joi.number().required(),
  serviceAmount: Joi.number().required(),
  tax: Joi.string().required(),
});

const chargingTariffDefaultUpdateValidationSchema = Joi.object({
  value: Joi.number(),
  serviceAmount: Joi.number(),
  tax: Joi.string(),
});

const adminCreateUserSchema = Joi.object({
  mobile: Joi.string().required(),
  username: Joi.string().allow("", null).optional(),
  email: Joi.string().email().allow("", null).optional(),
  wallet: Joi.number().optional(),
}).unknown(true);

module.exports = {
  vehicleValidationSchema,
  reviewEditSchema,
  taxValidationSchema,
  chargingTariffValidationSchema,
  chargingTariffUpdateValidationSchema,
  chargingTariffDefaultValidationSchema,
  chargingTariffDefaultUpdateValidationSchema,
  adminCreateUserSchema,
};
