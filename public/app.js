const WINDS = ["东", "南", "西", "北"];

const state = {
  avatars: [],
  view: "home",
  code: "",
  room: null,
  session: { hostToken: null, players: {} },
  panel: null,
  editingId: "",
  pickedAvatar: "",
  draftName: "",
  scores: {},
  confirmEnd: false,
  undoArmed: false,
  homeError: "",
  busy: false,
  toastTimer: 0,
  pollTimer: 0,
  undoTimer: 0,
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#fff7fb";
}

function earsMarkup(kind, accent, face) {
  switch (kind) {
    case "bunny":
      return `<ellipse cx="26" cy="16" rx="6" ry="13" fill="${accent}"/><ellipse cx="54" cy="16" rx="6" ry="13" fill="${accent}"/><ellipse cx="26" cy="16" rx="3" ry="8" fill="${face}"/><ellipse cx="54" cy="16" rx="3" ry="8" fill="${face}"/>`;
    case "cat":
      return `<path d="M24 34 L30 12 L40 30 Z" fill="${accent}"/><path d="M56 34 L50 12 L40 30 Z" fill="${accent}"/>`;
    case "bear":
      return `<circle cx="22" cy="24" r="9" fill="${accent}"/><circle cx="58" cy="24" r="9" fill="${accent}"/>`;
    case "chick":
      return `<ellipse cx="24" cy="20" rx="8" ry="5" fill="${accent}" transform="rotate(-24 24 20)"/><ellipse cx="56" cy="20" rx="8" ry="5" fill="${accent}" transform="rotate(24 56 20)"/>`;
    case "puppy":
      return `<ellipse cx="18" cy="30" rx="8" ry="12" fill="${accent}" transform="rotate(-20 18 30)"/><ellipse cx="62" cy="30" rx="8" ry="12" fill="${accent}" transform="rotate(20 62 30)"/>`;
    case "fox":
      return `<path d="M16 36 L28 10 L42 30 Z" fill="${accent}"/><path d="M64 36 L52 10 L38 30 Z" fill="${accent}"/>`;
    case "panda":
      return `<circle cx="22" cy="26" r="10" fill="${accent}"/><circle cx="58" cy="26" r="10" fill="${accent}"/><ellipse cx="32" cy="44" rx="7" ry="8" fill="${accent}"/><ellipse cx="48" cy="44" rx="7" ry="8" fill="${accent}"/>`;
    case "frog":
      return `<circle cx="26" cy="20" r="10" fill="${accent}"/><circle cx="54" cy="20" r="10" fill="${accent}"/><circle cx="26" cy="20" r="4.5" fill="#3d4458"/><circle cx="54" cy="20" r="4.5" fill="#3d4458"/><circle cx="27.4" cy="18.8" r="1.4" fill="#fff"/><circle cx="55.4" cy="18.8" r="1.4" fill="#fff"/>`;
    case "pigtail":
      return `<circle cx="14" cy="42" r="8" fill="${accent}"/><circle cx="66" cy="42" r="8" fill="${accent}"/><path d="M28 32c2-12 6-16 12-16s10 4 12 16c-4-7-8-9-12-9s-8 2-12 9z" fill="${accent}"/>`;
    case "sprout":
      return `<path d="M40 28c-10-2-16-12-14-18 9 1 16 9 14 18z" fill="${accent}"/><path d="M40 28c10-2 16-12 14-18-9 1-16 9-14 18z" fill="#b6f0c8"/><rect x="38.4" y="26" width="3.2" height="8" rx="1.6" fill="#5cbf86"/>`;
    case "bow":
      return `<path d="M40 22c-8-12-22-8-20 2 1 6 12 8 20 1 8 7 19 5 20-1 2-10-12-14-20-2z" fill="${accent}"/>`;
    case "cap":
      return `<path d="M20 36c2-16 12-20 20-20s18 4 20 20H20z" fill="${accent}"/><path d="M14 36h52v5c0 2-6 4-12 4H26c-6 0-12-2-12-4z" fill="${accent}"/>`;
    default:
      return "";
  }
}

function avatarSvg(id) {
  const avatar = state.avatars.find((item) => item.id === id);
  if (!avatar || avatar.kind !== "cute" || !/^[a-z0-9-]{1,32}$/.test(avatar.ears || "")) return "";
  const face = safeColor(avatar.face);
  const accent = safeColor(avatar.accent);
  const cheek = safeColor(avatar.cheek);
  const bg = safeColor(avatar.bg);
  const mouth = avatar.beak
    ? `<path d="M36 47 h8 l-4 5 z" fill="#ffb703"/>`
    : `<path d="M34 49c2.2 2.6 9.8 2.6 12 0" fill="none" stroke="#e07a8a" stroke-width="1.7" stroke-linecap="round"/>`;
  const eyes = avatar.beak
    ? `<ellipse cx="32" cy="43" rx="2.1" ry="2.5" fill="#3d4458"/><ellipse cx="48" cy="43" rx="2.1" ry="2.5" fill="#3d4458"/>`
    : `<ellipse cx="32" cy="43" rx="3.3" ry="3.8" fill="#3d4458"/><ellipse cx="48" cy="43" rx="3.3" ry="3.8" fill="#3d4458"/><circle cx="33.2" cy="41.6" r="1.15" fill="#fff"/><circle cx="49.2" cy="41.6" r="1.15" fill="#fff"/>`;
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="40" fill="${bg}"/><circle cx="40" cy="46" r="18" fill="${face}"/>${earsMarkup(avatar.ears, accent, face)}<ellipse cx="28" cy="52" rx="4.2" ry="2.3" fill="${cheek}"/><ellipse cx="52" cy="52" rx="4.2" ry="2.3" fill="${cheek}"/>${eyes}${mouth}</svg>`;
}

function avatarButton(id) {
  const avatar = state.avatars.find((item) => item.id === id);
  const label = avatar ? avatar.label : "头像";
  const pressed = state.pickedAvatar === id;
  return `<button type="button" class="pick" data-action="pick" data-avatar="${esc(id)}" aria-pressed="${pressed ? "true" : "false"}" aria-label="${esc(label)}"><span class="avatar">${avatarSvg(id)}</span><small>${esc(label)}</small></button>`;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function readJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode can refuse storage; the table still works for this visit.
  }
}

function loadNickname() {
  try {
    return String(localStorage.getItem("mj.nickname") || "").slice(0, 12);
  } catch {
    return "";
  }
}

function saveNickname(name) {
  try {
    localStorage.setItem("mj.nickname", name);
  } catch {
    // The seat is already saved on the server.
  }
}

function loadSession(code) {
  const all = readJsonStorage("mj.sessions", {});
  const saved = all[code] || {};
  return {
    hostToken: typeof saved.hostToken === "string" ? saved.hostToken : null,
    players: saved.players && typeof saved.players === "object" ? saved.players : {},
  };
}

function saveSession() {
  const all = readJsonStorage("mj.sessions", {});
  all[state.code] = state.session;
  writeJsonStorage("mj.sessions", all);
}

function loadRecents() {
  const recents = readJsonStorage("mj.recents", []);
  return Array.isArray(recents) ? recents.filter((item) => /^\d{5}$/.test(item.code || "")) : [];
}

function remember(room) {
  const recents = loadRecents().filter((item) => item.code !== room.code);
  recents.unshift({
    code: room.code,
    names: room.players.map((player) => player.name).slice(0, 4),
    at: Date.now(),
  });
  writeJsonStorage("mj.recents", recents.slice(0, 8));
}

function authToken() {
  if (state.session.hostToken) return state.session.hostToken;
  const tokens = Object.values(state.session.players || {});
  return tokens.find((token) => typeof token === "string" && token) || "";
}

function canManage() {
  return Boolean(authToken());
}

function localIds() {
  return new Set(Object.keys(state.session.players || {}));
}

function playerName(id) {
  return state.room?.players.find((player) => player.id === id)?.name || "有人";
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["content-type"] = "application/json";
  const token = authToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("没有连上牌桌");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "没有连上牌桌");
  return data;
}

function toast(message) {
  const el = document.querySelector("#toast");
  el.hidden = false;
  el.textContent = message;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 1800);
}

function parseScore(raw) {
  const text = String(raw ?? "").trim();
  if (text === "" || text === "-" || text === "+") return { ok: true, value: 0, empty: true };
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, value: 0, empty: false };
  const value = Number(text);
  if (!Number.isInteger(value) || Math.abs(value) > 1000000) return { ok: false, value: 0, empty: false };
  return { ok: true, value, empty: false };
}

function scoreState() {
  const players = state.room?.players || [];
  let sum = 0;
  let any = false;
  let bad = false;
  const deltas = {};
  for (const player of players) {
    const parsed = parseScore(state.scores[player.id] ?? "");
    if (!parsed.ok) bad = true;
    deltas[player.id] = parsed.value;
    sum += parsed.value;
    if (!parsed.empty && parsed.value !== 0) any = true;
  }
  let hint = "给每人填这一局的分数";
  if (bad) hint = "请填整数";
  else if (any && sum !== 0) hint = `合计 ${formatDelta(sum)}`;
  else if (any) hint = "合计 0";
  return { ok: !bad && any && sum === 0 && players.length >= 2, deltas, hint };
}

function updateSum() {
  const el = document.querySelector("#sum");
  const button = document.querySelector("[data-action='commit']");
  const parsed = scoreState();
  if (el) {
    el.textContent = parsed.hint;
    el.className = parsed.ok ? "sum ok" : "sum";
  }
  if (button) button.disabled = !parsed.ok;
}

function leaderId() {
  const players = state.room?.players || [];
  if (players.length < 2) return "";
  if (players.every((player) => player.total === 0)) return "";
  const top = Math.max(...players.map((player) => player.total));
  const leaders = players.filter((player) => player.total === top);
  return leaders.length === 1 ? leaders[0].id : "";
}

function played(id) {
  return (state.room?.rounds || []).some((round) => Object.prototype.hasOwnProperty.call(round.deltas || {}, id));
}

function renderHome() {
  const nickname = loadNickname();
  const recents = loadRecents().slice(0, 2);
  const recentHtml = recents.map((item) => `
    <button type="button" class="recent" data-action="open" data-code="${esc(item.code)}">
      <b>${esc(item.code)}</b>
      <small>${esc(item.names.join("、") || "还没有人")}</small>
    </button>`).join("");
  return `<div class="screen home">
    <header class="hero">
      <p class="eyebrow">春天开一桌</p>
      <h1>麻将记分</h1>
      <p class="lede">五位数字进同一间，给每人直接填分数。</p>
    </header>
    <div class="body">
      <button type="button" class="btn primary" data-action="create">开一桌</button>
      <form id="join-form" class="stack">
        <label for="join-code">房间号</label>
        <input id="join-code" class="code-input" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="38421" aria-label="五位数字房间号">
        <button class="btn mint" type="submit">进入</button>
      </form>
      ${nickname ? `<p class="hint">称呼已记住：${esc(nickname)}，下次直接用</p>` : `<p class="hint">第一次坐下后，称呼会记在这台手机上</p>`}
      ${recentHtml ? `<div class="recents">${recentHtml}</div>` : ""}
      <p class="error">${esc(state.homeError)}</p>
    </div>
  </div>`;
}

function renderSeat() {
  const title = state.panel === "edit" ? "改一下" : "怎么称呼";
  const canRemove = state.panel === "edit" && !played(state.editingId);
  return `<div class="screen">
    <header class="top">
      <button type="button" class="home-link" data-action="close-panel">返回</button>
      <span class="meta">${esc(state.code)}</span>
    </header>
    <div class="body">
      <h2 class="panel-title">${title}</h2>
      <input id="seat-name" class="name-input" maxlength="12" autocomplete="nickname" placeholder="例如 阿明" value="${esc(state.draftName)}" aria-label="称呼">
      <div class="picks">${state.avatars.map((avatar) => avatarButton(avatar.id)).join("")}</div>
    </div>
    <div class="dock">
      ${canRemove ? `<button type="button" class="btn danger" data-action="remove">移出</button>` : ""}
      <button type="button" class="btn primary" data-action="${state.panel === "edit" ? "save-edit" : "save-sit"}">${state.panel === "edit" ? "保存" : "坐下"}</button>
    </div>
  </div>`;
}

function renderPlayer(player) {
  const mine = localIds().has(player.id);
  const wind = WINDS[(Math.max(player.seat, 1) - 1) % WINDS.length];
  const leader = leaderId() === player.id ? " leader" : "";
  const totalClass = player.total > 0 ? "up" : player.total < 0 ? "down" : "flat";
  const score = state.panel === "record"
    ? `<div class="score-field">
        <button type="button" class="sign" data-action="flip" data-player="${esc(player.id)}" aria-label="正负切换">−</button>
        <input class="score-input" inputmode="text" enterkeyhint="done" autocomplete="off" data-player="${esc(player.id)}" value="${esc(state.scores[player.id] || "")}" aria-label="${esc(player.name)} 这一局的分数">
      </div>`
    : `<b class="total ${totalClass}">${esc(formatDelta(player.total))}</b>`;
  const edit = state.panel !== "record" && state.room.status !== "ended" && canManage()
    ? `<button type="button" class="edit" data-action="edit" data-player="${esc(player.id)}" aria-label="修改${esc(player.name)}">改</button>`
    : "";
  return `<li class="player${leader}">
    <span class="avatar">${avatarSvg(player.avatar)}</span>
    <div class="who">
      <strong>${esc(player.name)}</strong>
      <em>${wind}${mine ? `<span class="me">我</span>` : ""}</em>
    </div>
    ${score}
    ${edit}
  </li>`;
}

function renderHistory() {
  const rounds = state.room.rounds || [];
  if (!rounds.length) return `<div class="history"><p class="hint">还没有对局。记一局时，给每人填上这一局的增减。</p></div>`;
  const undo = state.room.status !== "ended" && canManage()
    ? `<button type="button" class="link" data-action="undo">${state.undoArmed ? "确定撤销" : "撤销上一局"}</button>`
    : "";
  const lines = rounds.map((round) => {
    const parts = Object.entries(round.deltas || {})
      .filter(([, delta]) => delta)
      .map(([id, delta]) => `${playerName(id)} ${formatDelta(delta)}`);
    return `<p class="round"><b>第${round.seq}局</b><span>${esc(parts.join(" · ") || "分数没有变化")}</span></p>`;
  }).join("");
  return `<div class="history"><div class="history-head"><span>已经记下</span>${undo}</div>${lines}</div>`;
}

function renderDock() {
  if (state.panel === "record") {
    return `<button type="button" class="btn ghost" data-action="cancel-record">取消</button>
      <p id="sum" class="sum">给每人填这一局的分数</p>
      <button type="button" class="btn primary" data-action="commit" disabled>记下</button>`;
  }
  if (state.room.status === "ended") return `<p class="ended">这桌已经结束，总分留在这里</p>`;
  const seated = [...localIds()].some((id) => state.room.players.some((player) => player.id === id));
  const parts = [];
  if (!seated) parts.push(`<button type="button" class="btn mint" data-action="open-sit">坐下</button>`);
  if (canManage() && state.room.players.length >= 2) {
    parts.push(`<button type="button" class="btn ghost" data-action="ask-end">结束对局</button>`);
    parts.push(`<button type="button" class="btn primary" data-action="open-record">记一局</button>`);
  } else if (seated) {
    parts.push(`<p class="ended">再等一位坐下就能记分</p>`);
  }
  return parts.join("");
}

function renderTable() {
  if (state.panel === "sit" || state.panel === "edit") return renderSeat();
  const count = `${state.room.players.length} 人`;
  const meta = state.room.status === "ended" ? "已结束" : count;
  return `<div class="screen">
    <header class="top">
      <button type="button" class="home-link" data-action="home">首页</button>
      <button type="button" class="code-chip" data-action="copy" aria-label="复制房间号">${esc(state.code)}</button>
      <span class="meta">${meta}</span>
    </header>
    <div class="body">
      <ul class="players">${state.room.players.map(renderPlayer).join("")}</ul>
      ${state.panel === "record" ? "" : renderHistory()}
    </div>
    <div class="dock">${renderDock()}</div>
  </div>`;
}

function renderModal() {
  if (!state.confirmEnd) return "";
  return `<div class="modal-root">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title">
      <h2 id="end-title">结束这桌？</h2>
      <p>结束后不能再记分，总分会留下来。</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-action="cancel-end">再玩一会儿</button>
        <button type="button" class="btn primary" data-action="confirm-end">结束对局</button>
      </div>
    </div>
  </div>`;
}

function paint() {
  const app = document.querySelector("#app");
  app.innerHTML = state.view === "home" ? renderHome() : `${renderTable()}${renderModal()}`;
  if (state.panel === "record") updateSum();
}

async function guard(fn) {
  if (state.busy) return;
  state.busy = true;
  try {
    await fn();
  } catch (error) {
    toast(error.message || "没有连上牌桌");
  } finally {
    state.busy = false;
  }
}

function openRoom(code) {
  if (!/^\d{5}$/.test(code)) {
    state.homeError = "房间号是 5 位数字";
    paint();
    return;
  }
  state.homeError = "";
  if (location.hash === `#/r/${code}`) loadRoom(code);
  else location.hash = `#/r/${code}`;
}

async function createRoom() {
  await guard(async () => {
    const data = await request("/api/rooms", { method: "POST", body: "{}" });
    state.code = data.code;
    state.session = { hostToken: data.hostToken, players: {} };
    saveSession();
    state.room = data.room;
    state.view = "table";
    state.panel = "sit";
    state.draftName = loadNickname();
    state.pickedAvatar = state.avatars[0] ? state.avatars[0].id : "";
    state.confirmEnd = false;
    history.replaceState(null, "", `#/r/${data.code}`);
    remember(data.room);
    paint();
    startPoll();
    const input = document.querySelector("#seat-name");
    if (input) input.focus();
  });
}

async function loadRoom(code) {
  stopPoll();
  state.code = code;
  state.session = loadSession(code);
  state.view = "table";
  state.panel = null;
  state.confirmEnd = false;
  try {
    const data = await request(`/api/rooms/${code}`);
    state.room = data.room;
    remember(data.room);
    paint();
    startPoll();
  } catch (error) {
    state.view = "home";
    state.room = null;
    state.homeError = error.message;
    history.replaceState(null, "", "#/");
    paint();
  }
}

async function refreshRoom() {
  if (document.hidden || state.view !== "table" || !state.code) return;
  try {
    const data = await request(`/api/rooms/${state.code}`);
    const previousIds = (state.room?.players || []).map((player) => player.id).join();
    const previousRound = state.room?.rounds?.[0]?.id || "";
    const previousStatus = state.room?.status;
    state.room = data.room;
    const nextIds = data.room.players.map((player) => player.id).join();
    const nextRound = data.room.rounds[0]?.id || "";
    if (data.room.status === "ended" && state.panel === "record") {
      state.panel = null;
      state.scores = {};
      paint();
      return;
    }
    if (state.panel === "sit" || state.panel === "edit" || state.confirmEnd) return;
    if (state.panel === "record") {
      if (previousIds === nextIds && previousStatus === data.room.status) return;
      for (const player of data.room.players) {
        if (state.scores[player.id] == null) state.scores[player.id] = "";
      }
      paint();
      return;
    }
    if (previousIds === nextIds && previousRound === nextRound && previousStatus === data.room.status) return;
    paint();
  } catch {
    toast("没有连上牌桌");
  }
}

function startPoll() {
  stopPoll();
  state.pollTimer = setInterval(refreshRoom, 2000);
}

function stopPoll() {
  clearInterval(state.pollTimer);
  state.pollTimer = 0;
}

function cleanDraft() {
  return state.draftName.trim().slice(0, 12);
}

async function saveSit() {
  const name = cleanDraft();
  if (!name) {
    toast("先写一个称呼");
    return;
  }
  if (!state.pickedAvatar) {
    toast("选一个头像");
    return;
  }
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name, avatar: state.pickedAvatar }),
    });
    state.session.players[data.player.id] = data.token;
    saveSession();
    saveNickname(name);
    state.room = data.room;
    state.panel = null;
    remember(data.room);
    paint();
    toast("坐下了");
  });
}

async function saveEdit() {
  const name = cleanDraft();
  if (!name) {
    toast("先写一个称呼");
    return;
  }
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/players/${state.editingId}`, {
      method: "PATCH",
      body: JSON.stringify({ name, avatar: state.pickedAvatar }),
    });
    saveNickname(name);
    state.room = data.room;
    state.panel = null;
    remember(data.room);
    paint();
  });
}

async function removePlayer() {
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/players/${state.editingId}`, { method: "DELETE" });
    delete state.session.players[state.editingId];
    saveSession();
    state.room = data.room;
    state.panel = null;
    paint();
  });
}

function openRecord() {
  if ((state.room?.players.length || 0) < 2) {
    toast("至少两位才能记分");
    return;
  }
  state.panel = "record";
  state.confirmEnd = false;
  state.scores = {};
  for (const player of state.room.players) state.scores[player.id] = "";
  paint();
  const input = document.querySelector(".score-input");
  if (input) input.focus();
}

async function commitScores() {
  const parsed = scoreState();
  if (!parsed.ok) {
    toast(parsed.hint);
    return;
  }
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/rounds`, {
      method: "POST",
      body: JSON.stringify({ kind: "manual", deltas: parsed.deltas }),
    });
    state.room = data.room;
    state.panel = null;
    state.scores = {};
    remember(data.room);
    paint();
    toast("记下了");
  });
}

async function confirmEnd() {
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/end`, { method: "POST", body: "{}" });
    state.room = data.room;
    state.confirmEnd = false;
    state.panel = null;
    paint();
    toast("这桌结束了");
  });
}

async function undoLatest() {
  const latest = state.room?.rounds?.[0];
  if (!latest) return;
  if (!state.undoArmed) {
    state.undoArmed = true;
    clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => {
      state.undoArmed = false;
      const button = document.querySelector("[data-action='undo']");
      if (button) button.textContent = "撤销上一局";
    }, 2500);
    const button = document.querySelector("[data-action='undo']");
    if (button) button.textContent = "确定撤销";
    return;
  }
  state.undoArmed = false;
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/rounds/${latest.id}`, { method: "DELETE" });
    state.room = data.room;
    paint();
    toast("已撤销上一局");
  });
}

async function copyCode() {
  try {
    await navigator.clipboard.writeText(state.code);
    toast("房间号已复制");
  } catch {
    toast(state.code);
  }
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !document.querySelector("#app").contains(button)) {
    if (event.target.classList && event.target.classList.contains("modal-root")) {
      state.confirmEnd = false;
      paint();
    }
    return;
  }
  const action = button.dataset.action;
  if (action === "create") createRoom();
  else if (action === "open") openRoom(button.dataset.code || "");
  else if (action === "home") {
    stopPoll();
    state.view = "home";
    state.panel = null;
    state.confirmEnd = false;
    location.hash = "#/";
    paint();
  } else if (action === "copy") copyCode();
  else if (action === "open-sit") {
    state.panel = "sit";
    state.draftName = loadNickname();
    state.pickedAvatar = state.avatars[0] ? state.avatars[0].id : "";
    paint();
    const input = document.querySelector("#seat-name");
    if (input) input.focus();
  } else if (action === "close-panel" || action === "cancel-record") {
    state.panel = null;
    state.scores = {};
    paint();
  } else if (action === "pick") {
    state.pickedAvatar = button.dataset.avatar || "";
    document.querySelectorAll(".pick").forEach((item) => {
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
  } else if (action === "save-sit") saveSit();
  else if (action === "save-edit") saveEdit();
  else if (action === "remove") removePlayer();
  else if (action === "edit") {
    const player = state.room.players.find((item) => item.id === button.dataset.player);
    if (!player) return;
    state.panel = "edit";
    state.editingId = player.id;
    state.draftName = player.name;
    state.pickedAvatar = player.avatar;
    paint();
  } else if (action === "open-record") openRecord();
  else if (action === "flip") {
    const id = button.dataset.player;
    const raw = String(state.scores[id] || "");
    const next = raw.startsWith("-") ? raw.slice(1) : raw === "" ? "-" : `-${raw.replace(/^\+/, "")}`;
    state.scores[id] = next;
    const input = document.querySelector(`.score-input[data-player="${CSS.escape(id)}"]`);
    if (input) input.value = next;
    updateSum();
  } else if (action === "commit") commitScores();
  else if (action === "ask-end") {
    state.confirmEnd = true;
    paint();
  } else if (action === "cancel-end") {
    state.confirmEnd = false;
    paint();
  } else if (action === "confirm-end") confirmEnd();
  else if (action === "undo") undoLatest();
}

function onInput(event) {
  if (event.target.id === "join-code") {
    const next = digits(event.target.value);
    if (next !== event.target.value) event.target.value = next;
    return;
  }
  if (event.target.id === "seat-name") {
    state.draftName = event.target.value.slice(0, 12);
    return;
  }
  if (event.target.classList.contains("score-input")) {
    const id = event.target.dataset.player;
    let value = event.target.value.replace(/[^\d+-]/g, "").replace(/(?!^)[+-]/g, "").slice(0, 8);
    if (value !== event.target.value) event.target.value = value;
    state.scores[id] = value;
    updateSum();
  }
}

function onSubmit(event) {
  if (event.target.id !== "join-form") return;
  event.preventDefault();
  const input = event.target.querySelector("input");
  openRoom(digits(input.value));
}

function onKeydown(event) {
  if (event.key !== "Enter") return;
  if (event.target.id === "seat-name") {
    event.preventDefault();
    if (state.panel === "edit") saveEdit();
    else saveSit();
  } else if (event.target.classList.contains("score-input")) {
    event.preventDefault();
    commitScores();
  }
}

function route() {
  const match = location.hash.match(/^#\/r\/(\d{5})$/);
  if (!match) {
    stopPoll();
    state.view = "home";
    state.panel = null;
    state.confirmEnd = false;
    paint();
    return;
  }
  if (state.view === "table" && state.code === match[1] && state.room) return;
  loadRoom(match[1]);
}

async function boot() {
  const response = await fetch("/avatars.json");
  state.avatars = await response.json();
  const app = document.querySelector("#app");
  app.addEventListener("click", onClick);
  app.addEventListener("input", onInput);
  app.addEventListener("submit", onSubmit);
  app.addEventListener("keydown", onKeydown);
  window.addEventListener("hashchange", route);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshRoom();
  });
  route();
}

boot();
