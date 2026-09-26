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

//! Station portal

const portalPassword = Joi.string()
  .min(8)
  .max(64)
  .pattern(/[A-Za-z]/, "letter")
  .pattern(/\d/, "digit")
  .required()
  .messages({
    "string.min": "Password must be at least 8 characters",
    "string.pattern.name": "Password must contain at least one letter and one number",
  });

const portalEmail = Joi.string().trim().lowercase().email().max(254);

const portalLoginSchema = Joi.object({
  email: portalEmail.required(),
  password: Joi.string().max(128).required(),
});

const portalChangePasswordSchema = Joi.object({
  currentPassword: Joi.string().max(128).required(),
  newPassword: portalPassword,
});

const portalForgotPasswordSchema = Joi.object({
  email: portalEmail.required(),
});

const portalResetPasswordSchema = Joi.object({
  email: portalEmail.required(),
  otp: Joi.string().pattern(/^\d{6}$/).required().messages({
    "string.pattern.base": "Code must be 6 digits",
  }),
  newPassword: portalPassword,
});

const stationUserCreateSchema = Joi.object({
  name: Joi.string().trim().max(100).required(),
  email: portalEmail.required(),
  mobile: Joi.string().trim().max(20).allow(""),
  station: Joi.string().hex().length(24).required(),
});

const stationUserUpdateSchema = Joi.object({
  name: Joi.string().trim().max(100),
  email: portalEmail,
  mobile: Joi.string().trim().max(20).allow(""),
  isActive: Joi.boolean(),
}).min(1);

const stationUserListQuerySchema = Joi.object({
  pageNo: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().trim().max(100).allow(""),
});

// Portal report queries. A station/location id is deliberately NOT accepted: the
// station always comes from the signed-in portal user.
const portalDateRange = {
  startDate: Joi.string().pattern(DATE_STRING_PATTERN).required().messages({
    "string.pattern.base": '"startDate" must be in YYYY-MM-DD format',
  }),
  endDate: Joi.string().pattern(DATE_STRING_PATTERN).required().messages({
    "string.pattern.base": '"endDate" must be in YYYY-MM-DD format',
  }),
};

const portalChargerFilter = {
  cpid: Joi.string().trim().max(100),
};

const portalOverviewQuerySchema = Joi.object({ ...portalDateRange });

const portalChargingSummaryQuerySchema = Joi.object({
  ...portalDateRange,
  ...portalChargerFilter,
  groupBy: Joi.string().valid("day", "month", "charger", "connector").default("day"),
});

const portalFinanceQuerySchema = Joi.object({
  ...portalDateRange,
  ...portalChargerFilter,
  groupBy: Joi.string().valid("day", "month", "charger").default("day"),
});

const portalTransactionsQuerySchema = Joi.object({
  ...portalDateRange,
  ...portalChargerFilter,
  connectorId: Joi.number().integer().min(0),
  transactionMode: Joi.string().valid("mobile", "rfid"),
  search: Joi.string().trim().max(100).allow(""),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string()
    .valid("startTime", "endTime", "transactionId", "energyKwh", "durationSeconds", "totalAmount")
    .default("startTime"),
  sortOrder: Joi.string().valid("asc", "desc").default("desc"),
});

const portalUptimeQuerySchema = Joi.object({
  ...portalDateRange,
  ...portalChargerFilter,
});

// Same filters as the on-screen report plus the file format
const withPortalExportFormat = (schema) =>
  schema.keys({ format: Joi.string().valid("xlsx", "csv").default("xlsx") });

module.exports = {
  portalOverviewQuerySchema,
  portalChargingSummaryQuerySchema,
  portalFinanceQuerySchema,
  portalTransactionsQuerySchema,
  portalUptimeQuerySchema,
  withPortalExportFormat,
  vehicleValidationSchema,
  reviewEditSchema,
  taxValidationSchema,
  chargingTariffValidationSchema,
  chargingTariffUpdateValidationSchema,
  chargingTariffDefaultValidationSchema,
  chargingTariffDefaultUpdateValidationSchema,
  reportViewQuerySchema,
  portalLoginSchema,
  portalChangePasswordSchema,
  portalForgotPasswordSchema,
  portalResetPasswordSchema,
  stationUserCreateSchema,
  stationUserUpdateSchema,
  stationUserListQuerySchema,
};
