const crypto = require("crypto");

// Unlike generateRandomPassword (Math.random), these use a CSPRNG. Ambiguous
// characters (0/O, 1/l/I) are left out because the password is read from an email.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const ALL = LOWER + UPPER + DIGITS;

const pick = (charset) => charset[crypto.randomInt(charset.length)];

const generateSecurePassword = (length = 12) => {
  // Guarantee at least one of each class so it always passes the portal password policy
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALL));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
};

const generateNumericOtp = (digits = 6) =>
  String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");

module.exports = { generateSecurePassword, generateNumericOtp };
