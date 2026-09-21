const Joi = require("joi");
const { REPORT_SORT_FIELDS, DEFAULT_SORT_BY } = require("../controllers/reports/pipes");

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
  name: Joi.string(),
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

const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const reportViewQuerySchema = Joi.object({
  reportType: Joi.string().valid("charging-sessions").required(),
  startDate: Joi.string().pattern(DATE_STRING_PATTERN).required().messages({
    "string.pattern.base": '"startDate" must be in YYYY-MM-DD format',
  }),
  endDate: Joi.string().pattern(DATE_STRING_PATTERN).required().messages({
    "string.pattern.base": '"endDate" must be in YYYY-MM-DD format',
  }),
  location: Joi.string().hex().length(24),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid(...Object.keys(REPORT_SORT_FIELDS))
    .default(DEFAULT_SORT_BY),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

module.exports = {
  vehicleValidationSchema,
  reviewEditSchema,
  taxValidationSchema,
  chargingTariffValidationSchema,
  chargingTariffUpdateValidationSchema,
  chargingTariffDefaultValidationSchema,
  chargingTariffDefaultUpdateValidationSchema,
  reportViewQuerySchema,
};
