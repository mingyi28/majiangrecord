const crypto = require("crypto");

function roomCode() {
  return String(crypto.randomInt(0, 100000)).padStart(5, "0");
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function newId() {
  return crypto.randomUUID();
}

module.exports = { roomCode, newToken, hashToken, newId };
