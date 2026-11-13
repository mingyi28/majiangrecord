const fs = require("fs");
const path = require("path");
const { AppError } = require("./errors");
const { settle } = require("./scoring");
const { buildLeaderboard, shapeRoom, summarize } = require("./overview");
const { hashToken, newId, newToken, roomCode } = require("./tokens");

const MAX_PLAYERS = 8;
const MAX_ROUNDS = 400;
const MAX_ROOMS = 2000;
const RECENT_WINDOW_MS = 10 * 60 * 1000;
const RECENT_LIMIT = 30;
const EMPTY_ROOM_MS = 48 * 60 * 60 * 1000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function totalsOf(room) {
  const totals = {};
  for (const player of room.players) totals[player.id] = 0;
  for (const round of room.rounds) {
    for (const [id, delta] of Object.entries(round.deltas)) {
      if (Object.prototype.hasOwnProperty.call(totals, id)) totals[id] += delta;
    }
  }
  return totals;
}

function present(room) {
  const totals = totalsOf(room);
  return {
    code: room.code,
    status: room.status || "active",
    endedAt: room.endedAt || null,
    createdAt: room.createdAt,
    players: room.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        seat: player.seat,
        total: totals[player.id] || 0,
        createdAt: player.createdAt,
      })),
    rounds: room.rounds
      .slice()
      .sort((a, b) => b.seq - a.seq)
      .map((round) => ({
        id: round.id,
        seq: round.seq,
        kind: round.kind,
        winnerId: round.winnerId,
        payerId: round.payerId,
        points: round.points,
        note: round.note,
        createdBy: round.createdBy,
        createdAt: round.createdAt,
        deltas: { ...round.deltas },
      })),
  };
}

function createMemoryStore(filePath) {
  const rooms = new Map();
  const feedback = [];
  let adminPasswordHash = null;
  let chain = Promise.resolve();

  function lock(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function persist() {
    if (!filePath) return;
    const payload = JSON.stringify({ rooms: [...rooms.values()], feedback, adminPasswordHash });
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, payload);
    fs.renameSync(tmp, filePath);
  }

  function load() {
    if (!filePath || !fs.existsSync(filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    for (const room of parsed.rooms || []) rooms.set(room.code, room);
    for (const item of parsed.feedback || []) feedback.push(item);
    if (typeof parsed.adminPasswordHash === "string" && /^[a-f0-9]{64}$/.test(parsed.adminPasswordHash)) {
      adminPasswordHash = parsed.adminPasswordHash;
    }
  }

  function prune(now) {
    for (const room of rooms.values()) {
      const age = now - Date.parse(room.createdAt);
      if (age > EMPTY_ROOM_MS && room.rounds.length === 0) rooms.delete(room.code);
    }
  }

  function requireRoom(code) {
    const room = rooms.get(code);
    if (!room) throw new AppError(404, "找不到这桌，核对一下房间号");
    return room;
  }

  function ensureOpen(room) {
    const status = room.status || "active";
    if (status === "dissolved") throw new AppError(409, "这桌已经解散了");
    if (status === "ended") throw new AppError(409, "这桌已经结束了");
  }

  return {
    async ready() {
      load();
    },

    async close() {},

    createRoom() {
      return lock(() => {
        const now = Date.now();
        prune(now);
        const recent = [...rooms.values()].filter((room) => now - Date.parse(room.createdAt) < RECENT_WINDOW_MS);
        if (recent.length >= RECENT_LIMIT) throw new AppError(429, "开桌太频繁，请稍后再试");
        if (rooms.size >= MAX_ROOMS) throw new AppError(429, "牌桌太多了，请稍后再开新桌");

        let code = roomCode();
        for (let i = 0; i < 5 && rooms.has(code); i += 1) code = roomCode();
        if (rooms.has(code)) throw new AppError(500, "房间号没有生成成功");

        const hostToken = newToken();
        const room = {
          id: newId(),
          code,
          hostTokenHash: hashToken(hostToken),
          status: "active",
          endedAt: null,
          createdAt: new Date(now).toISOString(),
          players: [],
          rounds: [],
        };
        rooms.set(code, room);
        persist();
        return { code, hostToken, room: present(room) };
      });
    },

    getRoom(code) {
      return lock(() => {
        const room = rooms.get(code);
        if (!room) throw new AppError(404, "找不到这桌，核对一下房间号");
        return present(room);
      });
    },

    authenticate(code, token) {
      return lock(() => {
        if (!token) return null;
        const room = rooms.get(code);
        if (!room) return null;
        const hash = hashToken(token);
        if (hash === room.hostTokenHash) return { role: "host", playerId: null };
        const player = room.players.find((item) => item.tokenHash === hash);
        if (!player) return null;
        return { role: "player", playerId: player.id };
      });
    },

    addPlayer(code, { name, avatar }) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        if (room.players.length >= MAX_PLAYERS) throw new AppError(409, "这桌已经坐满了");
        const token = newToken();
        const seat = room.players.reduce((max, player) => Math.max(max, player.seat), 0) + 1;
        const player = {
          id: newId(),
          name,
          avatar,
          tokenHash: hashToken(token),
          seat,
          createdAt: new Date().toISOString(),
        };
        room.players.push(player);
        persist();
        return {
          token,
          player: { id: player.id, name, avatar, seat, total: 0, createdAt: player.createdAt },
          room: present(room),
        };
      });
    },

    updatePlayer(code, playerId, { name, avatar }) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new AppError(404, "找不到这个人");
        player.name = name;
        player.avatar = avatar;
        persist();
        return { room: present(room) };
      });
    },

    removePlayer(code, playerId) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new AppError(404, "找不到这个人");
        const played = room.rounds.some((round) => Object.prototype.hasOwnProperty.call(round.deltas, playerId));
        if (played) throw new AppError(409, "已经记过对局的人不能移出");
        room.players = room.players.filter((item) => item.id !== playerId);
        persist();
        return { room: present(room) };
      });
    },

    addRound(code, input, actorId) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        if (room.rounds.length >= MAX_ROUNDS) throw new AppError(400, "这一桌的对局已经记满了");
        const settled = settle({ ...input, players: room.players, actorId });
        const seq = room.rounds.reduce((max, round) => Math.max(max, round.seq), 0) + 1;
        room.rounds.push({
          id: newId(),
          seq,
          kind: settled.kind,
          winnerId: settled.winnerId,
          payerId: settled.payerId,
          points: settled.points,
          note: input.note || (settled.kind === "draw" ? "流局" : ""),
          createdBy: actorId || "host",
          createdAt: new Date().toISOString(),
          deltas: settled.deltas,
        });
        persist();
        return { room: present(room) };
      });
    },

    deleteRound(code, roundId) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        if (room.rounds.length === 0) throw new AppError(400, "没有可以撤销的对局");
        const latest = room.rounds.reduce((best, round) => (round.seq > best.seq ? round : best));
        if (latest.id !== roundId) throw new AppError(409, "只能撤销最近一局");
        room.rounds = room.rounds.filter((round) => round.id !== roundId);
        persist();
        return { room: present(room) };
      });
    },

    endRoom(code) {
      return lock(() => {
        const room = requireRoom(code);
        ensureOpen(room);
        room.status = "ended";
        room.endedAt = new Date().toISOString();
        persist();
        return { room: present(room) };
      });
    },

    dissolveRoom(code) {
      return lock(() => {
        const room = requireRoom(code);
        if ((room.status || "active") === "dissolved") throw new AppError(409, "这桌已经解散了");
        room.status = "dissolved";
        room.endedAt = room.endedAt || new Date().toISOString();
        persist();
        return { room: present(room) };
      });
    },

    adminPasswordHash() {
      return lock(() => adminPasswordHash);
    },

    setAdminPassword(hash) {
      return lock(() => {
        if (adminPasswordHash) throw new AppError(409, "口令已经设置过了");
        adminPasswordHash = hash;
        persist();
        return { ok: true };
      });
    },

    adminOverview() {
      return lock(() => {
        const presented = [...rooms.values()]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map(present);
        return {
          summary: summarize(presented),
          rooms: presented.slice(0, 100).map(shapeRoom),
          leaderboard: buildLeaderboard(presented),
          feedback: feedback.slice(-100).reverse(),
        };
      });
    },

    addFeedback({ name, message, roomCode }) {
      return lock(() => {
        const recent = feedback.filter((item) => Date.now() - Date.parse(item.createdAt) < RECENT_WINDOW_MS);
        if (recent.length >= 60) throw new AppError(429, "反馈有点多，请稍后再试");
        feedback.push({
          id: newId(),
          name,
          message,
          roomCode,
          createdAt: new Date().toISOString(),
        });
        if (feedback.length > 500) feedback.splice(0, feedback.length - 500);
        persist();
        return { ok: true };
      });
    },

    dump() {
      return lock(() => clone([...rooms.values()]));
    },
  };
}

module.exports = { createMemoryStore };
