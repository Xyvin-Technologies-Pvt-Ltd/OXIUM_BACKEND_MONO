const Joi = require("joi");

const isProduction = process.env.NODE_ENV === "production";

/** Dev-only fallbacks so local runs work without full payment setup; never use in prod. */
function applyDevelopmentDefaults() {
  if (isProduction) return;

  if (!process.env.PAYMENT_WEBHOOK_SECRET?.trim()) {
    process.env.PAYMENT_WEBHOOK_SECRET =
      "development-only-payment-webhook-local";
    console.warn(
      "[env] PAYMENT_WEBHOOK_SECRET was missing — using a dev default; set it in .env for real webhooks"
    );
  }

  const ats = process.env.ACCESS_TOKEN_SECRET?.trim() ?? "";
  if (ats.length < 8) {
    process.env.ACCESS_TOKEN_SECRET =
      "development-access-token-secret-min-eight";
    console.warn(
      "[env] ACCESS_TOKEN_SECRET was missing or shorter than 8 chars — using a dev default; use a stronger secret for real tokens"
    );
  }
}

function buildSchema() {
  const accessMin = isProduction ? 16 : 8;

  return Joi.object({
    NODE_ENV: Joi.string()
      .valid("development", "production", "test")
      .default("development"),
    MONGO_URI: Joi.string()
      .pattern(/^mongodb(\+srv)?:\/\//)
      .required(),
    DB_NAME: Joi.string().min(1).required(),
    ACCESS_TOKEN_SECRET: Joi.string().min(accessMin).required(),
    PAYMENT_WEBHOOK_SECRET: Joi.string().min(8).required(),
    API_VERSION: Joi.string().default("v1"),
    CORS_ORIGIN: Joi.alternatives()
      .try(Joi.string(), Joi.array().items(Joi.string()))
      .required(),
  }).unknown(true);
}

function validateEnv() {
  applyDevelopmentDefaults();

  let cors = process.env.CORS_ORIGIN;
  if (typeof cors === "string" && cors.includes(",")) {
    cors = cors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const apiVersion = process.env.API_VERSION ?? "v1";
  const schema = buildSchema();

  const { error } = schema.validate(
    {
      ...process.env,
      API_VERSION: apiVersion,
      CORS_ORIGIN: cors,
    },
    { abortEarly: false }
  );

  if (error) {
    const msg = error.details.map((d) => d.message).join("; ");
    throw new Error(`Environment validation failed: ${msg}`);
  }
}

module.exports = { validateEnv, schema: buildSchema() };
