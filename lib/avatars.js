const fs = require("fs");
const path = require("path");

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,32}$/;
const EARS = new Set(["bunny", "cat", "bear", "chick", "puppy", "fox", "panda", "frog", "pigtail", "sprout", "bow", "cap"]);

function loadAvatars() {
  const file = path.join(__dirname, "..", "public", "avatars.json");
  const avatars = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(avatars) || avatars.length === 0) throw new Error("avatars.json is empty");
  const ids = new Set();
  for (const avatar of avatars) {
    if (!ID.test(avatar.id) || ids.has(avatar.id)) throw new Error(`bad avatar id ${avatar.id}`);
    ids.add(avatar.id);
    if (avatar.kind !== "cute") throw new Error(`bad avatar kind ${avatar.id}`);
    if (!EARS.has(avatar.ears)) throw new Error(`bad ears ${avatar.id}`);
    for (const key of ["face", "accent", "cheek", "bg"]) {
      if (!HEX.test(avatar[key])) throw new Error(`bad color ${avatar.id}`);
    }
    if (avatar.beak !== undefined && typeof avatar.beak !== "boolean") throw new Error(`bad beak ${avatar.id}`);
  }
  return avatars;
}

module.exports = { loadAvatars };
