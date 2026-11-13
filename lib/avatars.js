const fs = require("fs");
const path = require("path");

const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[a-z0-9-]{1,32}$/;
const GLYPH = /^[\u4e00-\u9fff]$/;
const FACE_STYLES = new Set(["short", "bob", "bun", "cap", "long", "buzz", "side", "band"]);
const FACE_EXTRAS = new Set(["none", "glasses", "blush", "mole"]);

function loadAvatars() {
  const file = path.join(__dirname, "..", "public", "avatars.json");
  const avatars = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(avatars) || avatars.length === 0) {
    throw new Error("avatars.json is empty");
  }
  const ids = new Set();
  for (const avatar of avatars) {
    if (!ID.test(avatar.id) || ids.has(avatar.id)) throw new Error(`bad avatar id ${avatar.id}`);
    ids.add(avatar.id);
    if (avatar.kind === "tile") {
      if (!GLYPH.test(avatar.glyph) || !HEX.test(avatar.ink) || !HEX.test(avatar.paper)) {
        throw new Error(`bad tile avatar ${avatar.id}`);
      }
    } else if (avatar.kind === "face") {
      if (!HEX.test(avatar.skin) || !HEX.test(avatar.hair) || !HEX.test(avatar.cloth)) {
        throw new Error(`bad face avatar ${avatar.id}`);
      }
      if (!FACE_STYLES.has(avatar.style) || !FACE_EXTRAS.has(avatar.extra)) {
        throw new Error(`bad face style ${avatar.id}`);
      }
    } else {
      throw new Error(`bad avatar kind ${avatar.id}`);
    }
  }
  return avatars;
}

module.exports = { loadAvatars };
