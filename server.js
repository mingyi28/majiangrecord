const fs = require("fs");
const http = require("http");
const path = require("path");
const { loadAvatars } = require("./lib/avatars");
const { AppError } = require("./lib/errors");
const { createStore } = require("./lib/store");

const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 8192;
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

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJson(req) {
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
  const match = header.match(/^Bearer\s+([A-Za-z0-9_-]{40,128})$/);
  return match ? match[1] : "";
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

function cleanNote(value) {
  const note = String(value ?? "").replace(/\s+/g, " ").trim();
  if ([...note].length > 30) throw new AppError(400, "备注最多 30 个字");
  if (/[\u0000-\u001f\u007f]/.test(note)) throw new AppError(400, "备注里有不能用的字符");
  return note;
}

function staticFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
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

      if (req.method === "POST" && rest === "/players") {
        const body = await readJson(req);
        const created = await store.addPlayer(code, {
          name: cleanName(body.name),
          avatar: cleanAvatar(body.avatar),
        });
        send(res, 201, created);
        return;
      }

      const playerMatch = rest.match(/^\/players\/([^/]+)$/);
      if (playerMatch && (req.method === "PATCH" || req.method === "DELETE")) {
        const playerId = playerMatch[1];
        if (!UUID.test(playerId)) throw new AppError(404, "找不到这个人");
        const auth = await requireAuth(code, bearer(req));
        if (req.method === "DELETE") {
          send(res, 200, await store.removePlayer(code, playerId));
          return;
        }
        const body = await readJson(req);
        send(res, 200, await store.updatePlayer(code, playerId, {
          name: cleanName(body.name),
          avatar: cleanAvatar(body.avatar),
        }));
        void auth;
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
        const body = await readJson(req);
        const saved = await store.addRound(
          code,
          {
            kind: body.kind,
            winnerId: body.winnerId,
            payerId: body.payerId,
            points: body.points,
            deltas: body.deltas,
            note: cleanNote(body.note),
          },
          auth.playerId || "host"
        );
        send(res, 201, saved);
        return;
      }

      const roundMatch = rest.match(/^\/rounds\/([^/]+)$/);
      if (req.method === "DELETE" && roundMatch) {
        const roundId = roundMatch[1];
        if (!UUID.test(roundId)) throw new AppError(404, "找不到这一局");
        await requireAuth(code, bearer(req));
        send(res, 200, await store.deleteRound(code, roundId));
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
