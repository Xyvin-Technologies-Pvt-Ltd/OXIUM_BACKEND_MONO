const { v4: uuidv4 } = require("uuid");

function requestIdMiddleware(req, res, next) {
  const incoming = req.headers["x-request-id"];
  req.requestId =
    typeof incoming === "string" && incoming.trim() ? incoming.trim() : uuidv4();
  res.setHeader("x-request-id", req.requestId);
  next();
}

module.exports = requestIdMiddleware;
