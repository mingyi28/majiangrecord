const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../server");
const { createMemoryStore } = require("../lib/memory-store");

async function withServer(fn, options) {
  const store = createMemoryStore(undefined, options);
  await store.ready();
  const server = createApp(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

async function send(base, path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data, headers: response.headers };
}

test("two phones share one running score", async () => {
  let clock = Date.now();
  await withServer(async (base) => {
    const created = await send(base, "/api/rooms", { method: "POST", body: {} });
    assert.equal(created.status, 201);
    const code = created.data.code;
    assert.match(code, /^\d{5}$/);
    assert.equal(created.data.room.status, "active");

    const host = created.data.hostToken;
    const ming = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "阿明", avatar: "bunny", profileId: "ming-main" },
    });
    const li = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "小李", avatar: "cat", profileId: "li-main" },
    });
    assert.equal(ming.status, 201);
    assert.equal(li.status, 201);

    const first = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 10 },
      },
    });
    assert.equal(first.status, 201);
    const afterFirst = Object.fromEntries(first.data.room.players.map((player) => [player.name, player.total]));
    assert.deepEqual(afterFirst, { 阿明: 0, 小李: 10 });

    const seenByLi = await send(base, `/api/rooms/${code}`);
    assert.equal(seenByLi.data.room.players.find((player) => player.name === "小李").total, 10);

    const second = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: li.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 6, [li.data.player.id]: 0 },
      },
    });
    assert.equal(second.status, 201);
    const totals = Object.fromEntries(second.data.room.players.map((player) => [player.name, player.total]));
    assert.deepEqual(totals, { 阿明: 6, 小李: 10 });
    assert.equal(second.data.room.rounds.length, 1);
    assert.equal(second.data.room.rounds[0].entries.length, 2);

    clock += 61_000;
    const nextRound = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 4 },
      },
    });
    assert.equal(nextRound.status, 201);
    assert.equal(nextRound.data.room.rounds.length, 2);

    const firstRound = nextRound.data.room.rounds.find((round) => round.seq === 1);
    const edited = await send(base, `/api/rooms/${code}/rounds/${firstRound.id}`, {
      method: "PATCH",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 15 },
      },
    });
    assert.equal(edited.status, 200);
    assert.ok(edited.data.room.rounds.find((round) => round.id === firstRound.id).editedAt);
    assert.deepEqual(
      Object.fromEntries(edited.data.room.players.map((player) => [player.name, player.total])),
      { 阿明: 6, 小李: 19 }
    );

    const cleared = await send(base, `/api/rooms/${code}/rounds/${firstRound.id}`, {
      method: "PATCH",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 0 },
      },
    });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.data.room.players.find((player) => player.name === "小李").total, 4);

    const restored = await send(base, `/api/rooms/${code}/rounds/${firstRound.id}`, {
      method: "PATCH",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 15 },
      },
    });
    assert.equal(restored.status, 200);

    const latest = restored.data.room.rounds.find((round) => round.seq === 2);
    const undone = await send(base, `/api/rooms/${code}/rounds/${latest.id}`, {
      method: "DELETE",
      token: host,
    });
    assert.equal(undone.status, 200);
    assert.equal(undone.data.room.rounds.length, 1);
    assert.equal(undone.data.room.players.find((player) => player.name === "小李").total, 15);

    const negative = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: -1 },
      },
    });
    assert.equal(negative.status, 400);
    assert.match(negative.data.error, /不能减少/);

    const selfAward = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 1, [li.data.player.id]: 0 },
      },
    });
    assert.equal(selfAward.status, 400);
    assert.match(selfAward.data.error, /不能给自己/);

    const ended = await send(base, `/api/rooms/${code}/end`, { method: "POST", token: host, body: {} });
    assert.equal(ended.status, 200);
    assert.equal(ended.data.room.status, "ended");
    const blocked = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 1 },
      },
    });
    assert.equal(blocked.status, 409);

    const byPlayer = await send(base, `/api/rooms/${code}`, { method: "DELETE", token: ming.data.token });
    assert.equal(byPlayer.status, 403);
    const dissolved = await send(base, `/api/rooms/${code}`, { method: "DELETE", token: host });
    assert.equal(dissolved.status, 200);
    assert.equal(dissolved.data.room.status, "dissolved");
    const scoredAgain = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: ming.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 0, [li.data.player.id]: 1 },
      },
    });
    assert.equal(scoredAgain.status, 409);

    await send(base, "/api/admin/setup", { method: "POST", body: { password: "table-admin" } });
    const overview = await send(base, "/api/admin/overview", { token: "table-admin" });
    assert.equal(overview.status, 200);
    assert.equal(overview.data.summary.dissolved, 1);
    assert.equal(overview.data.summary.rounds, 1);
    assert.equal(overview.data.leaderboard[0].name, "小李");
    assert.equal(overview.data.leaderboard[0].total, 15);
    assert.equal(overview.data.leaderboard[0].wins, 1);
    assert.equal(overview.data.leaderboard[1].name, "阿明");
    assert.equal(overview.data.leaderboard[1].total, 6);
    const room = overview.data.rooms.find((item) => item.code === code);
    assert.equal(room.players.find((player) => player.name === "小李").total, 15);
    assert.equal(room.rounds[0].seq, 1);
    assert.ok(room.rounds[0].editedAt);
  }, { now: () => clock });
});

test("scoring requires a seat token from this room", async () => {
  await withServer(async (base) => {
    const first = await send(base, "/api/rooms", { method: "POST", body: {} });
    const second = await send(base, "/api/rooms", { method: "POST", body: {} });
    const code = first.data.code;
    const ming = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "阿明", avatar: "fox", profileId: "ming-auth" },
    });
    await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "小李", avatar: "panda", profileId: "li-auth" },
    });
    const outsider = await send(base, `/api/rooms/${second.data.code}/players`, {
      method: "POST",
      body: { name: "外人", avatar: "chick", profileId: "outsider-auth" },
    });

    const missing = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 2, placeholder: 0 },
      },
    });
    assert.equal(missing.status, 401);

    const foreign = await send(base, `/api/rooms/${code}/rounds`, {
      method: "POST",
      token: outsider.data.token,
      body: {
        kind: "award",
        deltas: { [ming.data.player.id]: 2, placeholder: 0 },
      },
    });
    assert.equal(foreign.status, 401);

    const endMissing = await send(base, `/api/rooms/${code}/end`, { method: "POST", body: {} });
    assert.equal(endMissing.status, 401);

    const missingProfile = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "小王", avatar: "bunny" },
    });
    assert.equal(missingProfile.status, 400);
    assert.match(missingProfile.data.error, /角色/);

    const badName = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "   ", avatar: "bunny", profileId: "bad-name" },
    });
    assert.equal(badName.status, 400);

    const badAvatar = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "小王", avatar: "<script>", profileId: "bad-avatar" },
    });
    assert.equal(badAvatar.status, 400);
  });
});

test("one profile can only sit in one active room", async () => {
  await withServer(async (base) => {
    const first = await send(base, "/api/rooms", { method: "POST", body: {} });
    const second = await send(base, "/api/rooms", { method: "POST", body: {} });
    const profileId = "profile-one-room";
    const seated = await send(base, `/api/rooms/${first.data.code}/players`, {
      method: "POST",
      body: { name: "阿明", avatar: "bunny", profileId },
    });
    assert.equal(seated.status, 201);

    const blocked = await send(base, `/api/rooms/${second.data.code}/players`, {
      method: "POST",
      body: { name: "阿明", avatar: "bunny", profileId },
    });
    assert.equal(blocked.status, 409);
    assert.match(blocked.data.error, new RegExp(first.data.code));

    const ended = await send(base, `/api/rooms/${first.data.code}/end`, {
      method: "POST",
      token: first.data.hostToken,
      body: {},
    });
    assert.equal(ended.status, 200);
    const moved = await send(base, `/api/rooms/${second.data.code}/players`, {
      method: "POST",
      body: { name: "阿明", avatar: "bunny", profileId },
    });
    assert.equal(moved.status, 201);
  });
});

test("a full table stops at eight and names are stored as text", async () => {
  await withServer(async (base) => {
    const created = await send(base, "/api/rooms", { method: "POST", body: {} });
    const code = created.data.code;
    for (let i = 0; i < 8; i += 1) {
      const joined = await send(base, `/api/rooms/${code}/players`, {
        method: "POST",
        body: { name: `玩家${i}<b>`, avatar: "chick", profileId: `full-player-${i}` },
      });
      assert.equal(joined.status, 201);
      assert.equal(joined.data.player.name, `玩家${i}<b>`);
    }
    const overflow = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "第九人", avatar: "sprout", profileId: "full-player-nine" },
    });
    assert.equal(overflow.status, 409);

    const page = await send(base, "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
    const html = await fetch(`${base}/`).then((response) => response.text());
    assert.match(html, /麻将记分/);
    assert.doesNotMatch(html, /<script(?! src="\/app\.js")/);
    const adminPage = await fetch(`${base}/admin`);
    assert.equal(adminPage.status, 200);
    assert.match(await adminPage.text(), /麻将记分/);

    const ended = await send(base, `/api/rooms/${code}/end`, { method: "POST", token: created.data.hostToken, body: {} });
    assert.equal(ended.status, 200);
    const guest = await send(base, `/api/rooms/${code}`, { method: "DELETE", token: "nope" });
    assert.equal(guest.status, 401);
    const dissolved = await send(base, `/api/rooms/${code}`, { method: "DELETE", token: created.data.hostToken });
    assert.equal(dissolved.status, 200);
    assert.equal(dissolved.data.room.status, "dissolved");
    const again = await send(base, `/api/rooms/${code}/players`, {
      method: "POST",
      body: { name: "后来的", avatar: "bunny", profileId: "late-player" },
    });
    assert.equal(again.status, 409);

    const missingAdmin = await send(base, "/api/admin/overview");
    assert.equal(missingAdmin.status, 401);
    const status = await send(base, "/api/admin/status");
    assert.equal(status.data.needsSetup, true);
    const shortPassword = await send(base, "/api/admin/setup", { method: "POST", body: { password: "short" } });
    assert.equal(shortPassword.status, 400);
    const setup = await send(base, "/api/admin/setup", { method: "POST", body: { password: "table-admin" } });
    assert.equal(setup.status, 201);
    const overview = await send(base, "/api/admin/overview", { token: "table-admin" });
    assert.equal(overview.status, 200);
    assert.equal(overview.data.summary.rooms, 1);
    assert.equal(overview.data.summary.dissolved, 1);
    assert.equal(overview.data.summary.players, 8);
    assert.equal(overview.data.rooms[0].code, code);
    assert.equal(overview.data.rooms[0].players.length, 8);
    const wrong = await send(base, "/api/admin/overview", { token: "not-the-password" });
    assert.equal(wrong.status, 401);

    const emptyFeedback = await send(base, "/api/feedback", { method: "POST", body: { message: " " } });
    assert.equal(emptyFeedback.status, 400);
    const feedback = await send(base, "/api/feedback", {
      method: "POST",
      body: { name: "阿明", message: "希望可以导出战绩", roomCode: code },
    });
    assert.equal(feedback.status, 201);
    const withFeedback = await send(base, "/api/admin/overview", { token: "table-admin" });
    assert.equal(withFeedback.data.feedback[0].message, "希望可以导出战绩");
    assert.equal(withFeedback.data.feedback[0].roomCode, code);

    const leaked = await fetch(`${base}/..%2fpackage.json`);
    assert.equal(leaked.status, 404);
    const serverFile = await fetch(`${base}/server.js`);
    assert.equal(serverFile.status, 404);
  });
});
