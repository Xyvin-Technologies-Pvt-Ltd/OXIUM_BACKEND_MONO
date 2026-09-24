const jwt = require("jsonwebtoken");
const createError = require("http-errors");

const AUDIENCE = "station-portal";
const ISSUER = "OXIUM";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const REFRESH_COOKIE_NAME = "portal_rt";

// Portal tokens must use their own secrets. If they shared ACCESS_TOKEN_SECRET, the
// CMS authVerify middleware would accept a station user's token on every CMS route.
// Fail closed when that is not the case.
function getSecrets() {
  const access = process.env.PORTAL_ACCESS_TOKEN_SECRET;
  const refresh = process.env.PORTAL_REFRESH_TOKEN_SECRET;
  const cms = process.env.ACCESS_TOKEN_SECRET;

  if (!access || !refresh || access === refresh || access === cms || refresh === cms) {
    console.error(
      "Station portal auth disabled: PORTAL_ACCESS_TOKEN_SECRET and PORTAL_REFRESH_TOKEN_SECRET " +
        "must be set, differ from each other and differ from ACCESS_TOKEN_SECRET"
    );
    throw createError(500, "Station portal auth is not configured");
  }
  return { access, refresh };
}

const signOptions = (expiresIn) => ({
  algorithm: "HS256",
  audience: AUDIENCE,
  issuer: ISSUER,
  expiresIn,
});

const verifyOptions = { algorithms: ["HS256"], audience: AUDIENCE, issuer: ISSUER };

function signAccessToken(user) {
  const { access } = getSecrets();
  return jwt.sign(
    { sub: String(user._id), stationId: String(user.station), ver: user.tokenVersion, typ: "access" },
    access,
    signOptions(ACCESS_TOKEN_TTL_SECONDS)
  );
}

function signRefreshToken(user) {
  const { refresh } = getSecrets();
  return jwt.sign(
    { sub: String(user._id), ver: user.tokenVersion, typ: "refresh" },
    refresh,
    signOptions(REFRESH_TOKEN_TTL_SECONDS)
  );
}

function verifyToken(token, secret, expectedType) {
  let payload;
  try {
    payload = jwt.verify(token, secret, verifyOptions);
  } catch (error) {
    throw createError(401, "Invalid or expired token");
  }
  if (payload.typ !== expectedType) {
    throw createError(401, "Invalid or expired token");
  }
  return payload;
}

const verifyAccessToken = (token) => verifyToken(token, getSecrets().access, "access");
const verifyRefreshToken = (token) => verifyToken(token, getSecrets().refresh, "refresh");

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  REFRESH_COOKIE_NAME,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
};
