const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { AppError } = require("./errors");
const { settle } = require("./scoring");
const { buildLeaderboard, shapeRoom } = require("./overview");
const { hashToken, newId, newToken, roomCode } = require("./tokens");

const MAX_PLAYERS = 8;
const MAX_ROUNDS = 400;
const MAX_ROOMS = 2000;
const RECENT_WINDOW_MS = 10 * 60 * 1000;
const RECENT_LIMIT = 30;
const EMPTY_ROOM_MS = 48 * 60 * 60 * 1000;
const ROUND_WINDOW_MS = 60 * 1000;
const ROOM_INACTIVE_MS = 6 * 60 * 60 * 1000;

function poolOptions(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.delete("channel_binding");
  if (url.searchParams.get("sslmode") === "require") url.searchParams.set("sslmode", "verify-full");
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  return {
    connectionString: url.toString(),
    max: process.env.VERCEL ? 1 : 5,
    ssl: local ? undefined : { rejectUnauthorized: true },
  };
}

function createPgStore(connectionString) {
  const pool = new Pool(poolOptions(connectionString));

  async function withTx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // The connection may already be broken.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async function expireInactiveRooms(client) {
    const endedAt = new Date().toISOString();
    const cutoff = new Date(Date.now() - ROOM_INACTIVE_MS).toISOString();
    await client.query(
      `UPDATE rooms
       SET status = 'ended', ended_at = $1
       WHERE COALESCE(status, 'active') = 'active'
         AND updated_at < $2`,
      [endedAt, cutoff]
    );
  }

  async function touchRoom(client, roomId, timestamp = new Date().toISOString()) {
    await client.query("UPDATE rooms SET updated_at = $2 WHERE id = $1", [roomId, timestamp]);
  }

  async function present(client, roomId) {
    const roomResult = await client.query(
      "SELECT code, host_player_id, created_at, status, ended_at FROM rooms WHERE id = $1",
      [roomId]
    );
    const room = roomResult.rows[0];
    if (!room) throw new AppError(404, "找不到这桌，核对一下房间号");

    const players = await client.query(
      "SELECT id, name, avatar, seat, created_at, left_at FROM players WHERE room_id = $1 ORDER BY seat",
      [roomId]
    );
    const totals = await client.query(
      `SELECT d.player_id, COALESCE(SUM(d.delta), 0) AS total
       FROM round_deltas d
       JOIN rounds r ON r.id = d.round_id
       WHERE r.room_id = $1
       GROUP BY d.player_id`,
      [roomId]
    );
    const totalById = new Map(totals.rows.map((row) => [row.player_id, Number(row.total)]));
    const rounds = await client.query(
      `SELECT id, seq, kind, winner_id, payer_id, points, note, created_by, created_at, edited_at
       FROM rounds WHERE room_id = $1 ORDER BY seq DESC`,
      [roomId]
    );
    const roundIds = rounds.rows.map((row) => row.id);
    const deltas = roundIds.length
      ? await client.query(
          "SELECT round_id, player_id, delta FROM round_deltas WHERE round_id = ANY($1::text[])",
          [roundIds]
        )
      : { rows: [] };
    const deltaByRound = new Map();
    for (const row of deltas.rows) {
      if (!deltaByRound.has(row.round_id)) deltaByRound.set(row.round_id, {});
      deltaByRound.get(row.round_id)[row.player_id] = Number(row.delta);
    }
    const entryRows = roundIds.length
      ? await client.query(
          `SELECT e.round_id, e.actor_id, e.created_at, e.updated_at, d.player_id, d.delta
           FROM round_entries e
           LEFT JOIN round_entry_deltas d
             ON d.round_id = e.round_id AND d.actor_id = e.actor_id
           WHERE e.round_id = ANY($1::text[])
           ORDER BY e.created_at`,
          [roundIds]
        )
      : { rows: [] };
    const entriesByRound = new Map();
    for (const row of entryRows.rows) {
      if (!entriesByRound.has(row.round_id)) entriesByRound.set(row.round_id, new Map());
      const entries = entriesByRound.get(row.round_id);
      if (!entries.has(row.actor_id)) {
        entries.set(row.actor_id, {
          actorId: row.actor_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deltas: {},
        });
      }
      if (row.player_id) entries.get(row.actor_id).deltas[row.player_id] = Number(row.delta);
    }

    return {
      code: room.code,
      hostPlayerId: room.host_player_id || null,
      status: room.status || "active",
      endedAt: room.ended_at || null,
      createdAt: room.created_at,
      players: players.rows.map((player) => ({
        id: player.id,
        name: player.name,
        avatar: player.avatar,
        seat: player.seat,
        total: totalById.get(player.id) || 0,
        createdAt: player.created_at,
        leftAt: player.left_at || null,
      })),
      rounds: rounds.rows.map((round) => {
        const entries = [...(entriesByRound.get(round.id)?.values() || [])];
        const transfers = entries.flatMap((entry) =>
          Object.entries(entry.deltas || {})
            .filter(([playerId, delta]) => playerId !== entry.actorId && Number(delta) > 0)
            .map(([playerId, delta]) => ({
              fromPlayerId: entry.actorId,
              toPlayerId: playerId,
              points: Number(delta),
            }))
        );
        return {
          id: round.id,
          seq: round.seq,
          kind: round.kind,
          winnerId: round.winner_id,
          payerId: round.payer_id,
          points: round.points === null ? null : Number(round.points),
          note: round.note,
          createdBy: round.created_by,
          createdAt: round.created_at,
          updatedAt: entries.reduce(
            (latest, entry) => (Date.parse(entry.updatedAt) > Date.parse(latest) ? entry.updatedAt : latest),
            round.created_at
          ),
          editedAt: round.edited_at || null,
          entries,
          transfers,
          deltas: deltaByRound.get(round.id) || {},
        };
      }),
    };
  }

  async function assertOpen(client, roomId) {
    await expireInactiveRooms(client);
    const result = await client.query("SELECT status FROM rooms WHERE id = $1", [roomId]);
    const status = result.rows[0]?.status || "active";
    if (status === "dissolved") throw new AppError(409, "这桌已经解散了");
    if (status === "ended") throw new AppError(409, "这桌已经结束了");
  }

  async function roomIdByCode(client, code, { lock = false } = {}) {
    const sql = lock
      ? "SELECT id FROM rooms WHERE code = $1 FOR UPDATE"
      : "SELECT id FROM rooms WHERE code = $1";
    const result = await client.query(sql, [code]);
    if (!result.rows[0]) throw new AppError(404, "找不到这桌，核对一下房间号");
    return result.rows[0].id;
  }

  async function saveRoundEntry(client, roundId, actorId, deltas, timestamp) {
    await client.query(
      `INSERT INTO round_entries (round_id, actor_id, created_at, updated_at)
       VALUES ($1, $2, $3, $3)
       ON CONFLICT (round_id, actor_id)
       DO UPDATE SET updated_at = EXCLUDED.updated_at`,
      [roundId, actorId, timestamp]
    );
    await client.query(
      "DELETE FROM round_entry_deltas WHERE round_id = $1 AND actor_id = $2",
      [roundId, actorId]
    );
    for (const [playerId, delta] of Object.entries(deltas)) {
      await client.query(
        `INSERT INTO round_entry_deltas (round_id, actor_id, player_id, delta)
         VALUES ($1, $2, $3, $4)`,
        [roundId, actorId, playerId, delta]
      );
    }
    await client.query("DELETE FROM round_deltas WHERE round_id = $1", [roundId]);
    await client.query(
      `INSERT INTO round_deltas (round_id, player_id, delta)
       SELECT round_id, player_id, SUM(delta)::int
       FROM round_entry_deltas
       WHERE round_id = $1
       GROUP BY round_id, player_id`,
      [roundId]
    );
  }

  async function readAdminVisibility(client) {
    const result = await client.query("SELECT value FROM app_settings WHERE key = 'admin_visibility'");
    if (!result.rows[0]) return { players: [], rooms: [] };
    try {
      const parsed = JSON.parse(result.rows[0].value);
      return {
        players: Array.isArray(parsed.players) ? parsed.players : [],
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
      };
    } catch {
      return { players: [], rooms: [] };
    }
  }

  return {
    async ready() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name TEXT PRIMARY KEY,
          applied_at TEXT NOT NULL
        )
      `);
      const dir = path.join(__dirname, "..", "migrations");
      const files = fs.readdirSync(dir).filter((name) => name.endsWith(".sql")).sort();
      for (const name of files) {
        const seen = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
        if (seen.rowCount) continue;
        const sql = fs.readFileSync(path.join(dir, name), "utf8");
        await withTx(async (client) => {
          await client.query(sql);
          await client.query("INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)", [
            name,
            new Date().toISOString(),
          ]);
        });
      }
    },

    async close() {
      await pool.end();
    },

    async createRoom() {
      return withTx(async (client) => {
        const now = Date.now();
        await expireInactiveRooms(client);
        const cutoff = new Date(now - EMPTY_ROOM_MS).toISOString();
        await client.query(
          `DELETE FROM rooms
           WHERE created_at < $1
             AND NOT EXISTS (SELECT 1 FROM rounds WHERE rounds.room_id = rooms.id)`,
          [cutoff]
        );
        const recentSince = new Date(now - RECENT_WINDOW_MS).toISOString();
        const recent = await client.query("SELECT COUNT(*)::int AS n FROM rooms WHERE created_at > $1", [recentSince]);
        if (Number(recent.rows[0].n) >= RECENT_LIMIT) throw new AppError(429, "开桌太频繁，请稍后再试");
        const total = await client.query("SELECT COUNT(*)::int AS n FROM rooms");
        if (Number(total.rows[0].n) >= MAX_ROOMS) throw new AppError(429, "牌桌太多了，请稍后再开新桌");

        const hostToken = newToken();
        let code = roomCode();
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const id = newId();
          const createdAt = new Date(now).toISOString();
          await client.query("SAVEPOINT insert_room");
          try {
            await client.query(
              "INSERT INTO rooms (id, code, host_token_hash, created_at, updated_at, status) VALUES ($1, $2, $3, $4, $5, 'active')",
              [id, code, hashToken(hostToken), createdAt, createdAt]
            );
            await client.query("RELEASE SAVEPOINT insert_room");
            return { code, hostToken, room: await present(client, id) };
          } catch (error) {
            await client.query("ROLLBACK TO SAVEPOINT insert_room");
            if (error.code !== "23505") throw error;
            code = roomCode();
          }
        }
        throw new AppError(500, "房间号没有生成成功");
      });
    },

    async getRoom(code) {
      const client = await pool.connect();
      try {
        await expireInactiveRooms(client);
        const id = await roomIdByCode(client, code);
        return await present(client, id);
      } finally {
        client.release();
      }
    },

    async authenticate(code, token) {
      if (!token) return null;
      const hash = hashToken(token);
      const result = await pool.query(
        `SELECT r.host_token_hash, p.id AS player_id
         FROM rooms r
         LEFT JOIN players p ON p.room_id = r.id AND p.token_hash = $2 AND p.left_at IS NULL
         WHERE r.code = $1`,
        [code, hash]
      );
      const row = result.rows[0];
      if (!row) return null;
      if (row.host_token_hash === hash) return { role: "host", playerId: null };
      if (!row.player_id) return null;
      return { role: "player", playerId: row.player_id };
    },

    async addPlayer(code, { name, avatar, profileId, isHost = false }) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        if (profileId) {
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [profileId]);
          const occupied = await client.query(
            `SELECT r.code
             FROM players p
             JOIN rooms r ON r.id = p.room_id
             WHERE p.profile_id = $1
               AND p.left_at IS NULL
               AND COALESCE(r.status, 'active') = 'active'
             LIMIT 1`,
            [profileId]
          );
          if (occupied.rowCount) {
            const occupiedCode = occupied.rows[0].code;
            const message = occupiedCode === code ? "你已经在这个房间里了" : `你还在房间 ${occupiedCode}，请先退出后再加入新房间`;
            throw new AppError(409, message);
          }
          const departed = await client.query(
            `SELECT id, seat, created_at
             FROM players
             WHERE room_id = $1 AND profile_id = $2 AND left_at IS NOT NULL
             ORDER BY created_at DESC
             LIMIT 1`,
            [roomId, profileId]
          );
          if (departed.rowCount) {
            const token = newToken();
            const player = departed.rows[0];
            await client.query(
              `UPDATE players
               SET name = $1, avatar = $2, token_hash = $3, left_at = NULL
               WHERE id = $4`,
              [name, avatar, hashToken(token), player.id]
            );
            await touchRoom(client, roomId);
            const room = await present(client, roomId);
            return {
              token,
              player: room.players.find((item) => item.id === player.id),
              room,
            };
          }
        }
        const count = await client.query(
          "SELECT COUNT(*)::int AS n FROM players WHERE room_id = $1 AND left_at IS NULL",
          [roomId]
        );
        if (Number(count.rows[0].n) >= MAX_PLAYERS) throw new AppError(409, "这桌已经坐满了");
        const seatResult = await client.query(
          "SELECT COALESCE(MAX(seat), 0)::int AS seat FROM players WHERE room_id = $1",
          [roomId]
        );
        const token = newToken();
        const player = {
          id: newId(),
          name,
          avatar,
          seat: Number(seatResult.rows[0].seat) + 1,
          createdAt: new Date().toISOString(),
        };
        await client.query(
          `INSERT INTO players (id, room_id, name, avatar, profile_id, token_hash, seat, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [player.id, roomId, name, avatar, profileId || null, hashToken(token), player.seat, player.createdAt]
        );
        await touchRoom(client, roomId, player.createdAt);
        if (isHost) {
          await client.query(
            "UPDATE rooms SET host_player_id = $2 WHERE id = $1 AND host_player_id IS NULL",
            [roomId, player.id]
          );
        }
        return {
          token,
          player: { ...player, total: 0 },
          room: await present(client, roomId),
        };
      });
    },

    async updatePlayer(code, playerId, { name, avatar }) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const updated = await client.query(
          "UPDATE players SET name = $1, avatar = $2 WHERE id = $3 AND room_id = $4",
          [name, avatar, playerId, roomId]
        );
        if (!updated.rowCount) throw new AppError(404, "找不到这个人");
        await touchRoom(client, roomId);
        return { room: await present(client, roomId) };
      });
    },

    async removePlayer(code, playerId) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const played = await client.query(
          `SELECT 1 FROM round_deltas d
           JOIN rounds r ON r.id = d.round_id
           WHERE r.room_id = $1 AND d.player_id = $2
           LIMIT 1`,
          [roomId, playerId]
        );
        if (played.rowCount) throw new AppError(409, "已经记过对局的人不能移出");
        const removed = await client.query("DELETE FROM players WHERE id = $1 AND room_id = $2", [playerId, roomId]);
        if (!removed.rowCount) throw new AppError(404, "找不到这个人");
        await touchRoom(client, roomId);
        return { room: await present(client, roomId) };
      });
    },

    async leavePlayer(code, playerId) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const leftAt = new Date().toISOString();
        const departed = await client.query(
          `UPDATE players
           SET left_at = $3
           WHERE id = $1 AND room_id = $2 AND left_at IS NULL`,
          [playerId, roomId, leftAt]
        );
        if (!departed.rowCount) throw new AppError(409, "你已经退出这个房间了");
        await touchRoom(client, roomId, leftAt);
        return { room: await present(client, roomId) };
      });
    },

    async addRound(code, input, actorId) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const players = await client.query(
          "SELECT id FROM players WHERE room_id = $1 AND left_at IS NULL ORDER BY seat",
          [roomId]
        );
        const now = Date.now();
        const timestamp = new Date(now).toISOString();
        const latest = await client.query(
          `SELECT id, kind, created_at
           FROM rounds
           WHERE room_id = $1
           ORDER BY seq DESC
           LIMIT 1`,
          [roomId]
        );
        const current = latest.rows[0];
        const withinWindow = Boolean(
          current &&
          current.kind === "award" &&
          now - Date.parse(current.created_at) <= ROUND_WINDOW_MS
        );
        const settled = settle({ ...input, players: players.rows, actorId, allowEmpty: withinWindow });
        if (withinWindow) {
          await saveRoundEntry(client, current.id, actorId, settled.deltas, timestamp);
          await touchRoom(client, roomId, timestamp);
          return { room: await present(client, roomId) };
        }
        const count = await client.query("SELECT COUNT(*)::int AS n FROM rounds WHERE room_id = $1", [roomId]);
        if (Number(count.rows[0].n) >= MAX_ROUNDS) throw new AppError(400, "这一桌的对局已经记满了");
        const seqResult = await client.query(
          "SELECT COALESCE(MAX(seq), 0)::int AS seq FROM rounds WHERE room_id = $1",
          [roomId]
        );
        const roundId = newId();
        const note = input.note || (settled.kind === "draw" ? "流局" : "");
        await client.query(
          `INSERT INTO rounds
             (id, room_id, seq, kind, winner_id, payer_id, points, note, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            roundId,
            roomId,
            Number(seqResult.rows[0].seq) + 1,
            settled.kind,
            settled.winnerId,
            settled.payerId,
            settled.points,
            note,
            actorId || "host",
            timestamp,
          ]
        );
        await saveRoundEntry(client, roundId, actorId, settled.deltas, timestamp);
        await touchRoom(client, roomId, timestamp);
        return { room: await present(client, roomId) };
      });
    },

    async updateRound(code, roundId, input, actorId) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const round = await client.query(
          "SELECT id FROM rounds WHERE id = $1 AND room_id = $2",
          [roundId, roomId]
        );
        if (!round.rowCount) throw new AppError(404, "找不到这一局");
        const players = await client.query(
          "SELECT id FROM players WHERE room_id = $1 AND left_at IS NULL ORDER BY seat",
          [roomId]
        );
        const settled = settle({ ...input, players: players.rows, actorId, allowEmpty: true });
        const timestamp = new Date().toISOString();
        await saveRoundEntry(client, roundId, actorId, settled.deltas, timestamp);
        await client.query("UPDATE rounds SET edited_at = $2 WHERE id = $1", [roundId, timestamp]);
        await touchRoom(client, roomId, timestamp);
        return { room: await present(client, roomId) };
      });
    },

    async deleteRound(code, roundId) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const latest = await client.query(
          "SELECT id FROM rounds WHERE room_id = $1 ORDER BY seq DESC LIMIT 1",
          [roomId]
        );
        if (!latest.rows[0]) throw new AppError(400, "没有可以撤销的对局");
        if (latest.rows[0].id !== roundId) throw new AppError(409, "只能撤销最近一局");
        await client.query("DELETE FROM rounds WHERE id = $1 AND room_id = $2", [roundId, roomId]);
        await touchRoom(client, roomId);
        return { room: await present(client, roomId) };
      });
    },

    async endRoom(code) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        await assertOpen(client, roomId);
        const endedAt = new Date().toISOString();
        await client.query("UPDATE rooms SET status = 'ended', ended_at = $2 WHERE id = $1", [roomId, endedAt]);
        return { room: await present(client, roomId) };
      });
    },

    async dissolveRoom(code) {
      return withTx(async (client) => {
        const roomId = await roomIdByCode(client, code, { lock: true });
        const current = await client.query("SELECT status, ended_at FROM rooms WHERE id = $1", [roomId]);
        if ((current.rows[0]?.status || "active") === "dissolved") throw new AppError(409, "这桌已经解散了");
        const endedAt = current.rows[0]?.ended_at || new Date().toISOString();
        await client.query("UPDATE rooms SET status = 'dissolved', ended_at = $2 WHERE id = $1", [roomId, endedAt]);
        return { room: await present(client, roomId) };
      });
    },

    async adminPasswordHash() {
      const result = await pool.query("SELECT value FROM app_settings WHERE key = 'admin_password_hash'");
      return result.rows[0]?.value || null;
    },

    async setAdminPassword(hash) {
      const inserted = await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ('admin_password_hash', $1)
         ON CONFLICT (key) DO NOTHING`,
        [hash]
      );
      if (!inserted.rowCount) throw new AppError(409, "口令已经设置过了");
      return { ok: true };
    },

    async adminOverview() {
      const client = await pool.connect();
      try {
        await expireInactiveRooms(client);
        const counts = await client.query(
          `SELECT
             COUNT(*)::int AS rooms,
             COUNT(*) FILTER (WHERE COALESCE(status, 'active') = 'active')::int AS active,
             COUNT(*) FILTER (WHERE status = 'ended')::int AS ended,
             COUNT(*) FILTER (WHERE status = 'dissolved')::int AS dissolved
           FROM rooms`
        );
        const players = await client.query("SELECT COUNT(*)::int AS n FROM players");
        const rounds = await client.query("SELECT COUNT(*)::int AS n FROM rounds");
        const ids = await client.query("SELECT id FROM rooms ORDER BY created_at DESC LIMIT 100");
        const feedback = await client.query(
          "SELECT id, name, message, room_code, created_at FROM feedback ORDER BY created_at DESC LIMIT 100"
        );
        const visibility = await readAdminVisibility(client);
        const presented = [];
        for (const row of ids.rows) presented.push(await present(client, row.id));
        const row = counts.rows[0];
        return {
          summary: {
            rooms: row.rooms,
            active: row.active,
            ended: row.ended,
            dissolved: row.dissolved,
            players: players.rows[0].n,
            rounds: rounds.rows[0].n,
          },
          rooms: presented.map(shapeRoom),
          leaderboard: buildLeaderboard(presented),
          feedback: feedback.rows.map((item) => ({
            id: item.id,
            name: item.name,
            message: item.message,
            roomCode: item.room_code,
            createdAt: item.created_at,
          })),
          hiddenPlayers: visibility.players,
          hiddenRooms: visibility.rooms,
        };
      } finally {
        client.release();
      }
    },

    async setAdminVisibility({ kind, hidden, player, code }) {
      return withTx(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtext('admin_visibility'))");
        const visibility = await readAdminVisibility(client);
        if (kind === "player") {
          const key = `${player.name}\u0000${player.avatar}`;
          const index = visibility.players.findIndex((item) => `${item.name}\u0000${item.avatar}` === key);
          if (hidden && index < 0) visibility.players.push({ name: player.name, avatar: player.avatar });
          if (!hidden && index >= 0) visibility.players.splice(index, 1);
        } else {
          const index = visibility.rooms.indexOf(code);
          if (hidden && index < 0) visibility.rooms.push(code);
          if (!hidden && index >= 0) visibility.rooms.splice(index, 1);
        }
        visibility.players = visibility.players.slice(-500);
        visibility.rooms = visibility.rooms.slice(-500);
        await client.query(
          `INSERT INTO app_settings (key, value) VALUES ('admin_visibility', $1)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
          [JSON.stringify(visibility)]
        );
        return {
          hiddenPlayers: visibility.players,
          hiddenRooms: visibility.rooms,
        };
      });
    },

    async addFeedback({ name, message, roomCode }) {
      const recentSince = new Date(Date.now() - RECENT_WINDOW_MS).toISOString();
      const recent = await pool.query("SELECT COUNT(*)::int AS n FROM feedback WHERE created_at > $1", [recentSince]);
      if (Number(recent.rows[0].n) >= 60) throw new AppError(429, "反馈有点多，请稍后再试");
      await pool.query(
        `INSERT INTO feedback (id, name, message, room_code, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [newId(), name, message, roomCode, new Date().toISOString()]
      );
      return { ok: true };
    },
  };
}

module.exports = { createPgStore };
