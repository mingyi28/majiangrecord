const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { loadAvatars } = require("./lib/avatars");
const { AppError } = require("./lib/errors");
const { createStore } = require("./lib/store");
const { hashesEqual } = require("./lib/tokens");

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 8192;
const ADMIN_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};

function securityHeaders() {
  return {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy":
      "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  };
}

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body) && !Array.isArray(req.body)) {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    const type = String(req.headers["content-type"] || "");
    if (!type.includes("application/json")) {
      reject(new AppError(415, "请用 JSON 提交"));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new AppError(413, "提交的内容太大了"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => reject(new AppError(400, "没有读完这次提交")));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new AppError(400, "提交的格式不对"));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new AppError(400, "提交的格式不对"));
      }
    });
  });
}

function bearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+([\x21-\x7e]{8,200})$/);
  return match ? match[1] : "";
}

function cookie(req, name) {
  const header = String(req.headers.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

function adminPassword() {
  return String(process.env.ADMIN_PASSWORD || "");
}

function signAdminToken() {
  const payload = Buffer.from(JSON.stringify({
    exp: Date.now() + ADMIN_SESSION_MS,
    nonce: crypto.randomBytes(16).toString("base64url"),
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", adminPassword()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAdminToken(token) {
  const password = adminPassword();
  if (!password || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const expected = crypto.createHmac("sha256", password).update(parts[0]).digest("base64url");
  if (!hashesEqual(parts[1], expected)) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    return Number.isFinite(payload.exp) && payload.exp > Date.now();
  } catch {
    return false;
  }
}

function adminCookie(req, value, maxAge, name = "admin_token") {
  const secure = process.env.VERCEL || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`;
}

function normalizeCode(value) {
  return String(value || "").replace(/\D/g, "");
}

function cleanName(value) {
  const name = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!name) throw new AppError(400, "请输入名字");
  if ([...name].length > 12) throw new AppError(400, "名字最多 12 个字");
  if (/[\u0000-\u001f\u007f]/.test(name)) throw new AppError(400, "名字里有不能用的字符");
  return name;
}

function cleanProfileId(value) {
  if (value == null || value === "") throw new AppError(400, "缺少角色信息");
  const profileId = String(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/.test(profileId)) {
    throw new AppError(400, "角色信息不正确");
  }
  return profileId;
}

function cleanNote(value) {
  const note = String(value ?? "").replace(/\s+/g, " ").trim();
  if ([...note].length > 30) throw new AppError(400, "备注最多 30 个字");
  if (/[\u0000-\u001f\u007f]/.test(note)) throw new AppError(400, "备注里有不能用的字符");
  return note;
}

function cleanFeedback(value) {
  const message = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!message) throw new AppError(400, "请写下你的意见");
  if ([...message].length > 300) throw new AppError(400, "意见最多 300 个字");
  if (/[\u0000-\u001f\u007f]/.test(message)) throw new AppError(400, "意见里有不能用的字符");
  return message;
}

function staticFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = decoded === "/" || decoded === "/admin" || /^\/r\/\d{5}$/.test(decoded)
    ? "index.html"
    : decoded.replace(/^\/+/, "");
  if (!rel) return null;
  const full = path.resolve(PUBLIC_DIR, rel);
  if (full !== PUBLIC_DIR && !full.startsWith(`${PUBLIC_DIR}${path.sep}`)) return null;
  return full;
}

function createApp(store) {
  const avatars = loadAvatars();
  const avatarIds = new Set(avatars.map((avatar) => avatar.id));

  function cleanAvatar(value) {
    if (typeof value !== "string" || !avatarIds.has(value)) throw new AppError(400, "请选一个头像");
    return value;
  }

  async function adminStatus() {
    if (process.env.VERCEL && !process.env.DATABASE_URL) {
      return { needsSetup: false, unavailable: "线上还没接上数据库，历史记录存不住。请先设置 DATABASE_URL。" };
    }
    if (!adminPassword()) {
      return { needsSetup: false, unavailable: "请设置 ADMIN_PASSWORD 环境变量，再用这个口令进入管理端。" };
    }
    return { needsSetup: false };
  }

  function cleanPassword(value) {
    const password = String(value ?? "");
    if (!/^[\x21-\x7e]{8,64}$/.test(password)) throw new AppError(400, "口令用 8 到 64 位英文、数字或符号");
    return password;
  }

  async function requireAuth(code, token) {
    const auth = await store.authenticate(code, token);
    if (auth) return auth;
    await store.getRoom(code);
    throw new AppError(401, "请先坐下再操作");
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    const pathname = url.pathname;

    if (req.method === "GET" && pathname === "/api/health") {
      send(res, 200, { ok: true });
      return;
    }

    if (pathname === "/api/admin/status" && req.method === "GET") {
      send(res, 200, await adminStatus());
      return;
    }

    if (pathname === "/api/admin/login" && req.method === "POST") {
      const body = await readJson(req);
      const password = cleanPassword(body.password);
      const expected = adminPassword();
      if (!expected) throw new AppError(503, "管理口令还没有配置");
      if (!hashesEqual(password, expected)) throw new AppError(401, "口令不对");
      send(res, 200, { ok: true }, {
        "set-cookie": [
          adminCookie(req, signAdminToken(), 2592000),
          adminCookie(req, "", 0, "mj_admin"),
        ],
      });
      return;
    }

    if (pathname === "/api/admin/logout" && req.method === "POST") {
      send(res, 200, { ok: true }, {
        "set-cookie": [
          adminCookie(req, "", 0),
          adminCookie(req, "", 0, "mj_admin"),
        ],
      });
      return;
    }

    if (pathname === "/api/admin/overview" && req.method === "GET") {
      if (!verifyAdminToken(cookie(req, "admin_token"))) throw new AppError(401, "请重新登录");
      send(res, 200, await store.adminOverview());
      return;
    }

    if (pathname === "/api/admin/visibility" && req.method === "POST") {
      if (!verifyAdminToken(cookie(req, "admin_token"))) throw new AppError(401, "请重新登录");
      const body = await readJson(req);
      if (typeof body.hidden !== "boolean") throw new AppError(400, "隐藏状态不正确");
      if (body.kind === "player") {
        send(res, 200, await store.setAdminVisibility({
          kind: "player",
          hidden: body.hidden,
          player: { name: cleanName(body.name), avatar: cleanAvatar(body.avatar) },
        }));
        return;
      }
      if (body.kind === "room" && /^\d{5}$/.test(String(body.code || ""))) {
        send(res, 200, await store.setAdminVisibility({
          kind: "room",
          hidden: body.hidden,
          code: String(body.code),
        }));
        return;
      }
      throw new AppError(400, "隐藏对象不正确");
    }

    if (pathname === "/api/feedback" && req.method === "POST") {
      const body = await readJson(req);
      const name = body.name ? cleanName(body.name) : "";
      const roomCode = /^\d{5}$/.test(String(body.roomCode || "")) ? String(body.roomCode) : null;
      send(res, 201, await store.addFeedback({
        name,
        roomCode,
        message: cleanFeedback(body.message),
      }));
      return;
    }

    const roomMatch = pathname.match(/^\/api\/rooms(?:\/([^/]+))?(\/.*)?$/);
    if (roomMatch) {
      if (req.method === "POST" && pathname === "/api/rooms") {
        await readJson(req);
        const created = await store.createRoom();
        send(res, 201, created);
        return;
      }

      const code = normalizeCode(roomMatch[1]);
      if (!/^\d{5}$/.test(code)) throw new AppError(404, "找不到这桌，核对一下房间号");
      const rest = roomMatch[2] || "";

      if (req.method === "GET" && rest === "") {
        send(res, 200, { room: await store.getRoom(code) });
        return;
      }

      if (req.method === "DELETE" && rest === "") {
        const auth = await requireAuth(code, bearer(req));
        if (auth.role !== "host") throw new AppError(403, "只有开桌的人可以解散");
        send(res, 200, await store.dissolveRoom(code));
        return;
      }

      if (req.method === "POST" && rest === "/players") {
        const body = await readJson(req);
        const auth = await store.authenticate(code, bearer(req));
        const created = await store.addPlayer(code, {
          name: cleanName(body.name),
          avatar: cleanAvatar(body.avatar),
          profileId: cleanProfileId(body.profileId),
          isHost: auth?.role === "host",
        });
        send(res, 201, created);
        return;
      }

      const playerMatch = rest.match(/^\/players\/([^/]+)$/);
      if (playerMatch && req.method === "DELETE") {
        const playerId = playerMatch[1];
        if (!UUID.test(playerId)) throw new AppError(404, "找不到这个人");
        await requireAuth(code, bearer(req));
        send(res, 200, await store.removePlayer(code, playerId));
        return;
      }

      if (req.method === "POST" && rest === "/end") {
        await requireAuth(code, bearer(req));
        await readJson(req);
        send(res, 200, await store.endRoom(code));
        return;
      }

      if (req.method === "POST" && rest === "/rounds") {
        const auth = await requireAuth(code, bearer(req));
        if (!auth.playerId) throw new AppError(403, "请先以自己的角色坐下再记分");
        const body = await readJson(req);
        const saved = await store.addRound(
          code,
          {
            kind: "award",
            deltas: body.deltas,
            note: cleanNote(body.note),
          },
          auth.playerId || "host"
        );
        send(res, 201, saved);
        return;
      }

      const roundMatch = rest.match(/^\/rounds\/([^/]+)$/);
      if (req.method === "PATCH" && roundMatch) {
        const roundId = roundMatch[1];
        if (!UUID.test(roundId)) throw new AppError(404, "找不到这一局");
        const auth = await requireAuth(code, bearer(req));
        if (!auth.playerId) throw new AppError(403, "请先以自己的角色坐下再修改");
        const body = await readJson(req);
        send(res, 200, await store.updateRound(
          code,
          roundId,
          {
            kind: "award",
            deltas: body.deltas,
            note: cleanNote(body.note),
          },
          auth.playerId
        ));
        return;
      }
      throw new AppError(404, "没有这个接口");
    }

    if (pathname.startsWith("/api/")) throw new AppError(404, "没有这个接口");
    if (req.method !== "GET" && req.method !== "HEAD") throw new AppError(405, "不支持这个操作");

    const file = staticFile(pathname);
    if (!file) throw new AppError(404, "没有这一页");
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      throw new AppError(404, "没有这一页");
    }
    if (!stat.isFile()) throw new AppError(404, "没有这一页");
    const ext = path.extname(file);
    res.writeHead(200, {
      ...securityHeaders(),
      "content-type": TYPES[ext] || "application/octet-stream",
      "cache-control": "no-cache",
      "content-length": stat.size,
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      if (res.headersSent) return;
      const status = error.status || 500;
      if (status >= 500) console.error("request failed", error.code || status, error.message);
      send(res, status, { error: status >= 500 ? "记分没记下，请再试一次" : error.message });
    });
  });
}

async function main() {
  const store = await createStore();
  const server = createApp(store);
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, "0.0.0.0", () => {
    console.log(`mahjong score listening on ${port}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      server.close(() => {
        store.close().finally(() => process.exit(0));
      });
    });
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("failed to start", error.message);
    process.exit(1);
  });
}

module.exports = { createApp };
