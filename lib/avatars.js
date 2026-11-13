const fs = require("fs");
const path = require("path");

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,32}$/;
const SPECIES = new Set(["rabbit", "cat", "bear", "chick", "dog", "fox", "panda", "frog", "hamster", "deer", "penguin", "otter"]);

function loadAvatars() {
  const file = path.join(__dirname, "..", "public", "avatars.json");
  const avatars = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(avatars) || avatars.length === 0) throw new Error("avatars.json is empty");
  const ids = new Set();
  for (const avatar of avatars) {
    if (!ID.test(avatar.id) || ids.has(avatar.id)) throw new Error(`bad avatar id ${avatar.id}`);
    ids.add(avatar.id);
    if (avatar.kind !== "animal") throw new Error(`bad avatar kind ${avatar.id}`);
    if (!SPECIES.has(avatar.species)) throw new Error(`bad species ${avatar.id}`);
    for (const key of ["face", "accent", "detail", "cheek", "bg"]) {
      if (!HEX.test(avatar[key])) throw new Error(`bad color ${avatar.id}`);
    }
  }
  return avatars;
}

module.exports = { loadAvatars };
