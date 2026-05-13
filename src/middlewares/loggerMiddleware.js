require("dotenv").config({ override: false });
const winston = require("winston");

const CATEGORY = "OXIUM service";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.label({ label: CATEGORY }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
