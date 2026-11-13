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
const ROUND_WINDOW_MS = 60 * 1000;
const ROOM_INACTIVE_MS = 6 * 60 * 60 * 1000;

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

function entriesOf(round) {
  if (round.entries && typeof round.entries === "object" && !Array.isArray(round.entries)) return round.entries;
  const actorId = round.createdBy || "legacy";
  return {
    [actorId]: {
      actorId,
      createdAt: round.createdAt,
      updatedAt: round.createdAt,
      deltas: { ...round.deltas },
    },
  };
}

function aggregateEntries(players, entries) {
  const deltas = Object.fromEntries(players.map((player) => [player.id, 0]));
  for (const entry of Object.values(entries)) {
    for (const [playerId, delta] of Object.entries(entry.deltas || {})) {
      if (Object.prototype.hasOwnProperty.call(deltas, playerId)) deltas[playerId] += Number(delta) || 0;
    }
  }
  return deltas;
}

function present(room) {
  const totals = totalsOf(room);
  return {
    code: room.code,
    hostPlayerId: room.hostPlayerId || null,
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
        leftAt: player.leftAt || null,
      })),
    rounds: room.rounds
      .slice()
      .sort((a, b) => b.seq - a.seq)
      .map((round) => {
        const entries = Object.values(entriesOf(round));
        return {
          id: round.id,
          seq: round.seq,
          kind: round.kind,
          winnerId: round.winnerId,
          payerId: round.payerId,
          points: round.points,
          note: round.note,
          createdBy: round.createdBy,
          createdAt: round.createdAt,
          updatedAt: entries.reduce(
            (latest, entry) => (Date.parse(entry.updatedAt) > Date.parse(latest) ? entry.updatedAt : latest),
            round.createdAt
          ),
          editedAt: round.editedAt || null,
          entries: entries.map((entry) => ({
            actorId: entry.actorId,
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
            deltas: { ...entry.deltas },
          })),
          deltas: { ...round.deltas },
        };
      }),
  };
}

function createMemoryStore(filePath, { now = () => Date.now() } = {}) {
  const rooms = new Map();
  const feedback = [];
  const adminVisibility = { players: [], rooms: [] };
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
    const payload = JSON.stringify({ rooms: [...rooms.values()], feedback, adminPasswordHash, adminVisibility });
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
    for (const player of parsed.adminVisibility?.players || []) adminVisibility.players.push(player);
    for (const code of parsed.adminVisibility?.rooms || []) adminVisibility.rooms.push(code);
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

  function expireInactiveRooms(timestamp = now()) {
    let changed = false;
    for (const room of rooms.values()) {
      const status = room.status || "active";
      const updatedAt = Date.parse(room.updatedAt || room.createdAt);
      if (status === "active" && timestamp - updatedAt >= ROOM_INACTIVE_MS) {
        room.status = "ended";
        room.endedAt = new Date(timestamp).toISOString();
        changed = true;
      }
    }
    if (changed) persist();
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
        const timestamp = now();
        expireInactiveRooms(timestamp);
        prune(timestamp);
        const recent = [...rooms.values()].filter((room) => timestamp - Date.parse(room.createdAt) < RECENT_WINDOW_MS);
        if (recent.length >= RECENT_LIMIT) throw new AppError(429, "开桌太频繁，请稍后再试");
        if (rooms.size >= MAX_ROOMS) throw new AppError(429, "牌桌太多了，请稍后再开新桌");

        let code = roomCode();
        for (let i = 0; i < 5 && rooms.has(code); i += 1) code = roomCode();
        if (rooms.has(code)) throw new AppError(500, "房间号没有生成成功");

        const hostToken = newToken();
        const createdAt = new Date(timestamp).toISOString();
        const room = {
          id: newId(),
          code,
          hostTokenHash: hashToken(hostToken),
          hostPlayerId: null,
          status: "active",
          endedAt: null,
          createdAt,
          updatedAt: createdAt,
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
        expireInactiveRooms();
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
        const player = room.players.find((item) => item.tokenHash === hash && !item.leftAt);
        if (!player) return null;
        return { role: "player", playerId: player.id };
      });
    },

    addPlayer(code, { name, avatar, profileId, isHost = false }) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        if (profileId) {
          const occupied = [...rooms.values()].find((item) =>
            (item.status || "active") === "active"
            && item.players.some((player) => player.profileId === profileId && !player.leftAt)
          );
          if (occupied) {
            const message = occupied.code === code ? "你已经在这个房间里了" : `你还在房间 ${occupied.code}，请先退出后再加入新房间`;
            throw new AppError(409, message);
          }
          const departed = room.players.find((player) => player.profileId === profileId && player.leftAt);
          if (departed) {
            const token = newToken();
            departed.name = name;
            departed.avatar = avatar;
            departed.tokenHash = hashToken(token);
            departed.leftAt = null;
            room.updatedAt = new Date(now()).toISOString();
            persist();
            const presented = present(room);
            return {
              token,
              player: presented.players.find((player) => player.id === departed.id),
              room: presented,
            };
          }
        }
        if (room.players.filter((player) => !player.leftAt).length >= MAX_PLAYERS) {
          throw new AppError(409, "这桌已经坐满了");
        }
        const token = newToken();
        const seat = room.players.reduce((max, player) => Math.max(max, player.seat), 0) + 1;
        const player = {
          id: newId(),
          name,
          avatar,
          profileId: profileId || null,
          tokenHash: hashToken(token),
          seat,
          createdAt: new Date(now()).toISOString(),
        };
        room.players.push(player);
        room.updatedAt = player.createdAt;
        if (isHost && !room.hostPlayerId) room.hostPlayerId = player.id;
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
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new AppError(404, "找不到这个人");
        player.name = name;
        player.avatar = avatar;
        room.updatedAt = new Date(now()).toISOString();
        persist();
        return { room: present(room) };
      });
    },

    removePlayer(code, playerId) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        const player = room.players.find((item) => item.id === playerId);
        if (!player) throw new AppError(404, "找不到这个人");
        const played = room.rounds.some((round) => Object.prototype.hasOwnProperty.call(round.deltas, playerId));
        if (played) throw new AppError(409, "已经记过对局的人不能移出");
        room.players = room.players.filter((item) => item.id !== playerId);
        room.updatedAt = new Date(now()).toISOString();
        persist();
        return { room: present(room) };
      });
    },

    leavePlayer(code, playerId) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        const player = room.players.find((item) => item.id === playerId && !item.leftAt);
        if (!player) throw new AppError(409, "你已经退出这个房间了");
        player.leftAt = new Date(now()).toISOString();
        room.updatedAt = player.leftAt;
        persist();
        return { room: present(room) };
      });
    },

    addRound(code, input, actorId) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        const nowMs = now();
        const timestamp = new Date(nowMs).toISOString();
        const latest = room.rounds.reduce((best, round) => (!best || round.seq > best.seq ? round : best), null);
        const withinWindow = Boolean(
          latest &&
          latest.kind === "award" &&
          nowMs - Date.parse(latest.createdAt) <= ROUND_WINDOW_MS
        );
        const activePlayers = room.players.filter((player) => !player.leftAt);
        const settled = settle({ ...input, players: activePlayers, actorId, allowEmpty: withinWindow });
        if (withinWindow) {
          latest.entries = entriesOf(latest);
          const previous = latest.entries[actorId];
          latest.entries[actorId] = {
            actorId,
            createdAt: previous?.createdAt || timestamp,
            updatedAt: timestamp,
            deltas: settled.deltas,
          };
          latest.deltas = aggregateEntries(room.players, latest.entries);
          room.updatedAt = timestamp;
          persist();
          return { room: present(room) };
        }
        if (room.rounds.length >= MAX_ROUNDS) throw new AppError(400, "这一桌的对局已经记满了");
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
          createdAt: timestamp,
          editedAt: null,
          entries: {
            [actorId]: {
              actorId,
              createdAt: timestamp,
              updatedAt: timestamp,
              deltas: settled.deltas,
            },
          },
          deltas: settled.deltas,
        });
        room.updatedAt = timestamp;
        persist();
        return { room: present(room) };
      });
    },

    updateRound(code, roundId, input, actorId) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        const round = room.rounds.find((item) => item.id === roundId);
        if (!round) throw new AppError(404, "找不到这一局");
        const activePlayers = room.players.filter((player) => !player.leftAt);
        const settled = settle({ ...input, players: activePlayers, actorId, allowEmpty: true });
        const timestamp = new Date(now()).toISOString();
        round.entries = entriesOf(round);
        const previous = round.entries[actorId];
        round.entries[actorId] = {
          actorId,
          createdAt: previous?.createdAt || timestamp,
          updatedAt: timestamp,
          deltas: settled.deltas,
        };
        round.deltas = aggregateEntries(room.players, round.entries);
        round.editedAt = timestamp;
        room.updatedAt = timestamp;
        persist();
        return { room: present(room) };
      });
    },

    deleteRound(code, roundId) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        if (room.rounds.length === 0) throw new AppError(400, "没有可以撤销的对局");
        const latest = room.rounds.reduce((best, round) => (round.seq > best.seq ? round : best));
        if (latest.id !== roundId) throw new AppError(409, "只能撤销最近一局");
        room.rounds = room.rounds.filter((round) => round.id !== roundId);
        room.updatedAt = new Date(now()).toISOString();
        persist();
        return { room: present(room) };
      });
    },

    endRoom(code) {
      return lock(() => {
        expireInactiveRooms();
        const room = requireRoom(code);
        ensureOpen(room);
        room.status = "ended";
        room.endedAt = new Date(now()).toISOString();
        persist();
        return { room: present(room) };
      });
    },

    dissolveRoom(code) {
      return lock(() => {
        const room = requireRoom(code);
        if ((room.status || "active") === "dissolved") throw new AppError(409, "这桌已经解散了");
        room.status = "dissolved";
        room.endedAt = room.endedAt || new Date(now()).toISOString();
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
        expireInactiveRooms();
        const presented = [...rooms.values()]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map(present);
        return {
          summary: summarize(presented),
          rooms: presented.slice(0, 100).map(shapeRoom),
          leaderboard: buildLeaderboard(presented),
          feedback: feedback.slice(-100).reverse(),
          hiddenPlayers: clone(adminVisibility.players),
          hiddenRooms: [...adminVisibility.rooms],
        };
      });
    },

    setAdminVisibility({ kind, hidden, player, code }) {
      return lock(() => {
        if (kind === "player") {
          const key = `${player.name}\u0000${player.avatar}`;
          const index = adminVisibility.players.findIndex((item) => `${item.name}\u0000${item.avatar}` === key);
          if (hidden && index < 0) adminVisibility.players.push({ name: player.name, avatar: player.avatar });
          if (!hidden && index >= 0) adminVisibility.players.splice(index, 1);
        } else {
          const index = adminVisibility.rooms.indexOf(code);
          if (hidden && index < 0) adminVisibility.rooms.push(code);
          if (!hidden && index >= 0) adminVisibility.rooms.splice(index, 1);
        }
        persist();
        return {
          hiddenPlayers: clone(adminVisibility.players),
          hiddenRooms: [...adminVisibility.rooms],
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
