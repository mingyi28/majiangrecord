function shapeRoom(room) {
  const rounds = room.rounds || [];
  return {
    code: room.code,
    status: room.status || "active",
    createdAt: room.createdAt,
    endedAt: room.endedAt || null,
    players: (room.players || []).map((player) => ({
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      total: player.total,
    })),
    roundCount: rounds.length,
    rounds: rounds.slice(0, 30).map((round) => ({
      seq: round.seq,
      createdAt: round.createdAt,
      deltas: round.deltas,
    })),
  };
}

function summarize(rooms) {
  const summary = { rooms: rooms.length, active: 0, ended: 0, dissolved: 0, players: 0, rounds: 0 };
  for (const room of rooms) {
    const status = room.status || "active";
    if (status === "ended") summary.ended += 1;
    else if (status === "dissolved") summary.dissolved += 1;
    else summary.active += 1;
    summary.players += (room.players || []).length;
    summary.rounds += room.roundCount == null ? (room.rounds || []).length : room.roundCount;
  }
  return summary;
}

function buildLeaderboard(rooms) {
  const board = new Map();
  for (const room of rooms) {
    for (const player of room.players || []) {
      const key = `${player.name}\u0000${player.avatar}`;
      if (!board.has(key)) {
        board.set(key, {
          name: player.name,
          avatar: player.avatar,
          rooms: 0,
          rounds: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          total: 0,
        });
      }
      const row = board.get(key);
      row.rooms += 1;
      row.total += Number(player.total) || 0;
      for (const round of room.rounds || []) {
        if (!Object.prototype.hasOwnProperty.call(round.deltas || {}, player.id)) continue;
        const delta = Number(round.deltas[player.id]) || 0;
        row.rounds += 1;
        if (delta > 0) row.wins += 1;
        else if (delta < 0) row.losses += 1;
        else row.draws += 1;
      }
    }
  }
  return [...board.values()]
    .map((row) => ({
      ...row,
      winRate: row.rounds ? Math.round((row.wins / row.rounds) * 1000) / 10 : 0,
      average: row.rounds ? Math.round((row.total / row.rounds) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total || b.wins - a.wins || a.name.localeCompare(b.name, "zh-CN"))
    .map((row, index) => ({ rank: index + 1, ...row }));
}

module.exports = { shapeRoom, summarize, buildLeaderboard };
