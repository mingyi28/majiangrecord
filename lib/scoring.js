const { AppError } = require("./errors");

const MAX_POINTS = 100000;
const MAX_ABS_DELTA = 1000000;

function assertPlayer(id, idSet, message) {
  if (typeof id !== "string" || !idSet.has(id)) throw new AppError(400, message);
}

function assertPoints(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > MAX_POINTS) {
    throw new AppError(400, "分数要是 1 到 100000 的整数");
  }
  return value;
}

function assertDelta(value) {
  if (typeof value !== "number" || !Number.isInteger(value) || Math.abs(value) > MAX_ABS_DELTA) {
    throw new AppError(400, "增减要是整数");
  }
  return value;
}

function settle({ kind, players, winnerId, payerId, points, deltas, actorId, allowEmpty = false }) {
  if (!Array.isArray(players) || players.length < 2) {
    throw new AppError(400, "至少两位才能记分");
  }
  const ids = players.map((player) => player.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) throw new AppError(400, "座位有重复");

  if (kind === "zimo") {
    assertPlayer(winnerId, idSet, "请选择胡牌的人");
    const pts = assertPoints(points);
    const gain = pts * (ids.length - 1);
    if (gain > MAX_ABS_DELTA) throw new AppError(400, "分数太大了");
    const out = {};
    for (const id of ids) out[id] = id === winnerId ? gain : -pts;
    return { kind, winnerId, payerId: null, points: pts, deltas: out };
  }

  if (kind === "dianpao") {
    assertPlayer(winnerId, idSet, "请选择胡牌的人");
    assertPlayer(payerId, idSet, "请选择点炮的人");
    if (winnerId === payerId) throw new AppError(400, "胡牌和点炮不能是同一个人");
    const pts = assertPoints(points);
    const out = {};
    for (const id of ids) out[id] = 0;
    out[winnerId] = pts;
    out[payerId] = -pts;
    return { kind, winnerId, payerId, points: pts, deltas: out };
  }

  if (kind === "award") {
    if (!deltas || typeof deltas !== "object" || Array.isArray(deltas)) {
      throw new AppError(400, "请填写每个人本局增加的分数");
    }
    const keys = Object.keys(deltas);
    if (keys.length !== ids.length || keys.some((id) => !idSet.has(id))) {
      throw new AppError(400, "还要给每个人填上分数");
    }
    const out = {};
    for (const id of ids) {
      const n = assertDelta(deltas[id]);
      if (n < 0) throw new AppError(400, "分数只能增加，不能减少");
      out[id] = n;
    }
    if (actorId && out[actorId] !== 0) throw new AppError(400, "不能给自己增加分数");
    if (!allowEmpty && Object.values(out).every((n) => n === 0)) throw new AppError(400, "这局还没有分数");
    return { kind, winnerId: null, payerId: null, points: null, deltas: out };
  }

  if (kind === "manual") {
    if (!deltas || typeof deltas !== "object" || Array.isArray(deltas)) {
      throw new AppError(400, "请填写每人的增减");
    }
    const keys = Object.keys(deltas);
    if (keys.length !== ids.length || keys.some((id) => !idSet.has(id))) {
      throw new AppError(400, "还要给每位填上增减");
    }
    const out = {};
    let sum = 0;
    for (const id of ids) {
      const n = assertDelta(deltas[id]);
      out[id] = n;
      sum += n;
    }
    if (sum !== 0) throw new AppError(400, "增减加起来必须是 0");
    if (Object.values(out).every((n) => n === 0)) throw new AppError(400, "这局还没有分数");
    return { kind, winnerId: null, payerId: null, points: null, deltas: out };
  }

  if (kind === "draw") {
    const out = {};
    for (const id of ids) out[id] = 0;
    return { kind, winnerId: null, payerId: null, points: null, deltas: out };
  }

  throw new AppError(400, "记分方式不对");
}

module.exports = { settle };
