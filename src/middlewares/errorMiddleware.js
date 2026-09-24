const createError = require('http-errors')
const logger = require('./loggerMiddleware') // Import the custom logging configuration

// Custom error-handling middleware
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  // Log the error to the console

    // logger.error(err)

  // Handle specific error types
  if (err instanceof createError.InternalServerError) {
    res.status(500).json({ error: 'Internal Server Error' })
  } else {
    // String codes are set deliberately via http-errors (e.g. PASSWORD_CHANGE_REQUIRED);
    // numeric driver codes (Mongo 11000 etc.) are not passed through.
    const code = err.expose && typeof err.code === 'string' ? { code: err.code } : {}
    res.status(err.status || 500).json({ error: err.message, ...code })
  }
}

//! In future seperate operation error vs development error

module.exports = errorHandler
