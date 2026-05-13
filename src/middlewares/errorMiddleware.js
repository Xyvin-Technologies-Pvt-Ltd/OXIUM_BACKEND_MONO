const createError = require("http-errors");
const logger = require("./loggerMiddleware");

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  logger.error?.(err.message || err, {
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
    path: req.originalUrl,
    requestId: req.requestId,
  });

  const status = err.status || err.statusCode || 500;

  const code = status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";

  res.status(status).json({
    success: false,
    message: status >= 500 ? "Something went wrong" : err.message,
    error: { code },
    requestId: req.requestId,
  });
};

module.exports = errorHandler;
