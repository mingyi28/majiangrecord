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

module.exports = { shapeRoom, summarize };
