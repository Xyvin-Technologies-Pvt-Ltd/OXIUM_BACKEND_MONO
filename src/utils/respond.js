function ok(res, data, message = "OK", status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function fail(res, status, message, details) {
  return res.status(status).json({
    success: false,
    message,
    error: details ? { details } : undefined,
  });
}

module.exports = { ok, fail };
