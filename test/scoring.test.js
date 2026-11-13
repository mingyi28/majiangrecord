const test = require("node:test");
const assert = require("node:assert/strict");
const { settle } = require("../lib/scoring");

const players = [
  { id: "a" },
  { id: "b" },
  { id: "c" },
  { id: "d" },
];

test("zimo collects the same amount from everyone else", () => {
  const result = settle({ kind: "zimo", players, winnerId: "a", points: 10 });
  assert.deepEqual(result.deltas, { a: 30, b: -10, c: -10, d: -10 });
  assert.equal(Object.values(result.deltas).reduce((sum, n) => sum + n, 0), 0);
});

test("dianpao moves points from the discarder to the winner", () => {
  const result = settle({ kind: "dianpao", players, winnerId: "b", payerId: "c", points: 8 });
  assert.deepEqual(result.deltas, { a: 0, b: 8, c: -8, d: 0 });
});

test("manual entry must balance", () => {
  assert.throws(
    () => settle({ kind: "manual", players, deltas: { a: 10, b: -5, c: 0, d: 0 } }),
    /必须是 0/
  );
  const result = settle({ kind: "manual", players, deltas: { a: 15, b: -5, c: -5, d: -5 } });
  assert.equal(result.deltas.a, 15);
});

test("award entry only adds points", () => {
  const result = settle({ kind: "award", players, actorId: "a", deltas: { a: 0, b: 12, c: 3, d: 0 } });
  assert.deepEqual(result.deltas, { a: 0, b: 12, c: 3, d: 0 });
  assert.throws(
    () => settle({ kind: "award", players, actorId: "a", deltas: { a: 1, b: 0, c: 0, d: 0 } }),
    /不能给自己/
  );
  assert.throws(
    () => settle({ kind: "award", players, deltas: { a: 10, b: -2, c: 0, d: 0 } }),
    /不能减少/
  );
  assert.throws(
    () => settle({ kind: "award", players, deltas: { a: 0, b: 0, c: 0, d: 0 } }),
    /还没有分数/
  );
});

test("draw keeps every score unchanged", () => {
  const result = settle({ kind: "draw", players });
  assert.deepEqual(result.deltas, { a: 0, b: 0, c: 0, d: 0 });
});

test("rejects a one-player table and a winner who is also the discarder", () => {
  assert.throws(() => settle({ kind: "zimo", players: [{ id: "a" }], winnerId: "a", points: 1 }), /至少两位/);
  assert.throws(
    () => settle({ kind: "dianpao", players, winnerId: "a", payerId: "a", points: 1 }),
    /同一个人/
  );
});
