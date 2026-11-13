const WINDS = ["东", "南", "西", "北"];
const QUICK_POINTS = [1, 2, 5, 10, 20, 50];

const state = {
  avatars: [],
  view: "home",
  code: "",
  room: null,
  session: { hostToken: null, players: {} },
  sheet: null,
  editingId: "",
  pickedAvatar: "",
  draftName: "",
  record: emptyRecord(),
  recordPlayerKey: "",
  error: "",
  homeError: "",
  failed: "",
  busy: false,
  offline: false,
  undoArmed: false,
  pendingRemove: "",
  toastTimer: 0,
  pollTimer: 0,
  undoTimer: 0,
};

function emptyRecord() {
  return { kind: "zimo", winnerId: "", payerId: "", points: "", deltas: {}, note: "" };
}

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
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#1c1712";
}

function avatarSvg(id) {
  const avatar = state.avatars.find((item) => item.id === id);
  if (!avatar) return "";
  if (avatar.kind === "tile" && /^[\u4e00-\u9fff]$/.test(avatar.glyph)) {
    const ink = safeColor(avatar.ink);
    const paper = safeColor(avatar.paper);
    return `<svg viewBox="0 0 80 80" aria-hidden="true"><rect x="10" y="8" width="60" height="64" rx="8" fill="${paper}" stroke="#1c1712" stroke-width="3"/><rect x="16" y="14" width="48" height="52" rx="4" fill="none" stroke="${ink}" stroke-width="1.5" opacity=".45"/><text x="40" y="52" text-anchor="middle" font-size="30" font-family="Palatino, Songti SC, serif" fill="${ink}">${avatar.glyph}</text></svg>`;
  }
  if (avatar.kind !== "face") return "";
  const skin = safeColor(avatar.skin);
  const hair = safeColor(avatar.hair);
  const cloth = safeColor(avatar.cloth);
  const bangs = {
    short: `<path d="M24 36c2-12 10-18 16-18s14 6 16 18c-4-6-10-8-16-8s-12 2-16 8z" fill="${hair}"/>`,
    bob: `<path d="M23 34c1-12 9-18 17-18s16 6 17 18c-1 8-3 14-6 16-2-7-6-10-11-10s-9 3-11 10c-3-2-5-8-6-16z" fill="${hair}"/>`,
    bun: `<circle cx="40" cy="16" r="6" fill="${hair}"/><path d="M25 36c2-11 9-16 15-16s13 5 15 16c-4-5-9-7-15-7s-11 2-15 7z" fill="${hair}"/>`,
    cap: `<path d="M18 38h44c-2-12-12-18-22-18S20 26 18 38z" fill="${hair}"/><path d="M16 38h48v4H16z" fill="${cloth}"/>`,
    long: `<path d="M26 34c2-10 8-14 14-14s12 4 14 14c-4-4-8-6-14-6s-10 2-14 6z" fill="${hair}"/>`,
    buzz: `<path d="M26 35c2-9 8-13 14-13s12 4 14 13c-4-3-8-5-14-5s-10 2-14 5z" fill="${hair}"/>`,
    side: `<path d="M24 38c2-14 10-20 20-18 6 1 10 5 12 10-8-1-12 2-16 7-3-6-8-8-16 1z" fill="${hair}"/>`,
    band: `<path d="M25 35c2-11 9-15 15-15s13 4 15 15c-4-5-9-7-15-7s-11 2-15 7z" fill="${hair}"/><rect x="23" y="33" width="34" height="5" rx="2" fill="${cloth}"/>`,
  }[avatar.style] || "";
  const behind = avatar.style === "long"
    ? `<path d="M22 48c1 14 6 24 10 26 1-12 4-18 8-18s7 6 8 18c4-2 9-12 10-26-2-10-8-16-18-16s-16 6-18 16z" fill="${hair}"/>`
    : "";
  const extra = {
    glasses: `<g fill="none" stroke="${hair}" stroke-width="1.6"><circle cx="34" cy="40" r="4.2"/><circle cx="46" cy="40" r="4.2"/><path d="M38.2 40h3.6"/></g>`,
    blush: `<ellipse cx="31" cy="46" rx="3" ry="1.6" fill="#e29a8d"/><ellipse cx="49" cy="46" rx="3" ry="1.6" fill="#e29a8d"/>`,
    mole: `<circle cx="49" cy="46" r="1" fill="#6a4a38"/>`,
  }[avatar.extra] || "";
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="40" fill="${cloth}"/>${behind}<circle cx="40" cy="42" r="16" fill="${skin}"/><circle cx="24" cy="44" r="3" fill="${skin}"/><circle cx="56" cy="44" r="3" fill="${skin}"/>${bangs}<circle cx="34.5" cy="41" r="1.5" fill="#241c16"/><circle cx="46.5" cy="41" r="1.5" fill="#241c16"/><path d="M36 48c1.4 2 6.6 2 8 0" fill="none" stroke="#8a5344" stroke-width="1.4" stroke-linecap="round"/>${extra}</svg>`;
}

function avatarButton(id, { pressed, action, extra = "" }) {
  const avatar = state.avatars.find((item) => item.id === id);
  const label = avatar ? avatar.label : "头像";
  return `<button type="button" class="pick" data-action="${esc(action)}" data-avatar="${esc(id)}" ${extra} aria-pressed="${pressed ? "true" : "false"}" aria-label="${esc(label)}"><span class="avatar">${avatarSvg(id)}</span><small>${esc(label)}</small></button>`;
}

function normalizeCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatCode(code) {
  if (!code || code.length < 8) return code || "";
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  if (date.toDateString() === new Date().toDateString()) return time;
  const day = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return `${day} ${time}`;
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
  return Array.isArray(recents) ? recents : [];
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

function showSheetError(message) {
  state.error = message;
  const el = document.querySelector("#sheet-error");
  if (el) el.textContent = message;
  else toast(message);
}

function playerName(id) {
  return state.room?.players.find((player) => player.id === id)?.name || "有人";
}

function previewText() {
  const players = state.room?.players || [];
  const { kind, winnerId, payerId, points, deltas } = state.record;
  const pts = Number(points);
  if (kind === "draw") return "这一局流局，分数不变。";
  if (kind === "zimo") {
    if (!winnerId || !Number.isInteger(pts) || pts < 1) return "选胡牌的人，再填每人出多少。";
    return `${playerName(winnerId)} +${pts * (players.length - 1)}，其余各 -${pts}`;
  }
  if (kind === "dianpao") {
    if (!winnerId || !payerId || winnerId === payerId || !Number.isInteger(pts) || pts < 1) {
      return "选胡牌的人、点炮的人，再填分数。";
    }
    return `${playerName(payerId)} -${pts}，${playerName(winnerId)} +${pts}`;
  }
  const sum = players.reduce((total, player) => total + (deltas[player.id] || 0), 0);
  if (sum !== 0) return `现在合计 ${formatDelta(sum)}，要凑成 0。`;
  const parts = players
    .filter((player) => (deltas[player.id] || 0) !== 0)
    .map((player) => `${player.name} ${formatDelta(deltas[player.id])}`);
  return parts.length ? parts.join("，") : "给有输赢的人加减分。";
}

function canCommit() {
  const players = state.room?.players || [];
  if (players.length < 2) return false;
  const { kind, winnerId, payerId, points, deltas } = state.record;
  const pts = Number(points);
  if (kind === "draw") return true;
  if (kind === "zimo") return Boolean(winnerId) && Number.isInteger(pts) && pts >= 1;
  if (kind === "dianpao") {
    return Boolean(winnerId && payerId && winnerId !== payerId) && Number.isInteger(pts) && pts >= 1;
  }
  const sum = players.reduce((total, player) => total + (deltas[player.id] || 0), 0);
  const any = players.some((player) => (deltas[player.id] || 0) !== 0);
  return sum === 0 && any;
}

function renderHome(error = state.homeError) {
  state.homeError = error || "";
  document.body.classList.remove("lock");
  const recents = loadRecents();
  const recentHtml = recents.length
    ? `<section class="panel"><h2>回到牌桌</h2><div class="recent-list">${recents.map((item) => `<button type="button" class="recent" data-action="open-recent" data-code="${esc(item.code)}"><strong>${esc(formatCode(item.code))}</strong><span>${esc(item.names.length ? item.names.join("、") : "还没有人坐下")}</span></button>`).join("")}</div></section>`
    : "";
  document.querySelector("#app").innerHTML = `<main class="home">
    <div class="mark" aria-hidden="true"><span>中</span><span>发</span><span>白</span></div>
    <p class="kicker">牌桌账本</p>
    <h1>麻将记分</h1>
    <p class="lede">同桌各自输入名字、选一个头像。自摸、点炮和手动加减都记在后台，几台手机看的是同一张账。</p>
    ${state.homeError ? `<p class="banner">${esc(state.homeError)}</p>` : ""}
    <div class="panel stack">
      <button type="button" class="btn primary block" data-action="create-room">开一桌</button>
    </div>
    <form class="panel stack" data-form="join">
      <label for="join-code">已有房间号</label>
      <input id="join-code" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="例如 K7M2-P9QX" />
      <button type="submit" class="btn ghost block">加入这桌</button>
    </form>
    ${recentHtml}
  </main>`;
}

function renderTableShell() {
  document.querySelector("#app").innerHTML = `<div id="table"><div id="board"></div><div id="sheet-root" hidden></div></div>`;
}

function scoreClass(total) {
  if (total > 0) return "plus";
  if (total < 0) return "minus";
  return "zero";
}

function played(playerId) {
  return (state.room?.rounds || []).some((round) => Object.prototype.hasOwnProperty.call(round.deltas, playerId));
}

function paintBoard() {
  const board = document.querySelector("#board");
  if (!board) return;
  if (!state.room) {
    board.innerHTML = `<header class="topbar"><button type="button" class="text-btn" data-action="home">首页</button></header>
      <p class="lede">${esc(state.failed || "正在铺桌…")}</p>`;
    return;
  }
  const players = state.room.players;
  const locals = localIds();
  const markLocal = players.some((player) => locals.has(player.id)) && players.some((player) => !locals.has(player.id));
  const leaderId = leaderOf(players);
  const manageable = canManage();
  const playerHtml = players.length
    ? players.map((player, index) => {
        const acts = manageable
          ? `<div class="subacts"><button type="button" data-action="edit-player" data-id="${esc(player.id)}">改名</button>${played(player.id) ? "" : `<button type="button" data-action="remove-player" data-id="${esc(player.id)}">${state.pendingRemove === player.id ? "确认移出" : "移出"}</button>`}</div>`
          : "";
        return `<article class="player">
          <div class="avatar">${avatarSvg(player.avatar)}</div>
          <div>
            <div class="name-line">
              <h2 class="name">${esc(player.name)}</h2>
              <span class="tag">${esc(WINDS[index] || `${index + 1}座`)}</span>
              ${player.id === leaderId ? `<span class="tag">领先</span>` : ""}
              ${markLocal && locals.has(player.id) ? `<span class="tag me">本机</span>` : ""}
            </div>
            ${acts}
          </div>
          <p class="score ${scoreClass(player.total)}">${esc(formatDelta(player.total))}</p>
        </article>`;
      }).join("")
    : `<div class="empty"><p>这桌还空着。</p><p>写下名字，选一个头像，先坐下。</p></div>`;

  const rounds = state.room.rounds;
  const history = rounds.length
    ? rounds.map((round) => `<article class="round"><div class="round-top"><strong>第 ${round.seq} 局 · ${esc(kindLabel(round.kind))}</strong><span>${esc(formatWhen(round.createdAt))}</span></div><p>${esc(roundSummary(round))}</p><div class="deltas">${players.filter((player) => Object.prototype.hasOwnProperty.call(round.deltas, player.id)).map((player) => `<span>${esc(player.name)} ${esc(formatDelta(round.deltas[player.id] || 0))}</span>`).join("")}</div></article>`).join("")
    : `<div class="empty"><p>还没有对局。</p><p>人坐齐了，就记第一局。</p></div>`;

  const undo = rounds.length && manageable
    ? `<button type="button" class="text-btn" data-action="undo">${state.undoArmed ? "确认撤销" : "撤销上一局"}</button>`
    : "";
  const primary = manageable
    ? `<button type="button" class="btn primary" data-action="open-record" ${players.length < 2 ? "disabled" : ""}>${players.length < 2 ? "还差一位" : "记一局"}</button>`
    : `<button type="button" class="btn primary" data-action="open-sit">坐下</button>`;
  const secondary = manageable && players.length < 8
    ? `<button type="button" class="btn ghost" data-action="open-sit">${players.length ? "加人" : "坐下"}</button>`
    : `<button type="button" class="btn ghost" data-action="copy-code">复制房间号</button>`;

  board.innerHTML = `<header class="topbar">
      <div>
        <button type="button" class="code-btn" data-action="copy-code" aria-label="复制房间号">
          <small>房间号</small>
          <strong>${esc(formatCode(state.room.code))}</strong>
        </button>
        <p class="sync">${esc(syncLabel())}</p>
      </div>
      <button type="button" class="text-btn" data-action="home">首页</button>
    </header>
    <section class="players" aria-live="polite">${playerHtml}</section>
    <div class="section-head"><h2>对局</h2>${undo}</div>
    <section class="history">${history}</section>
    <div class="dock">${secondary}${primary}</div>`;
}

function leaderOf(players) {
  if (players.length < 2) return "";
  const top = Math.max(...players.map((player) => player.total));
  const low = Math.min(...players.map((player) => player.total));
  if (top === low) return "";
  const leaders = players.filter((player) => player.total === top);
  return leaders.length === 1 ? leaders[0].id : "";
}

function kindLabel(kind) {
  return { zimo: "自摸", dianpao: "点炮", manual: "手动", draw: "流局" }[kind] || "记分";
}

function roundSummary(round) {
  if (round.kind === "zimo") return `${playerName(round.winnerId)} 自摸，每人出 ${round.points}`;
  if (round.kind === "dianpao") return `${playerName(round.payerId)} 点炮，${playerName(round.winnerId)} 进 ${round.points}`;
  if (round.kind === "draw") return round.note || "流局";
  return round.note || "手动记了一笔";
}

function syncLabel() {
  if (state.offline) return "暂时没连上，分数还是刚才的";
  const count = state.room?.players.length || 0;
  return `${count} 人在座 · 已同步`;
}

function paintSync() {
  const el = document.querySelector(".sync");
  if (el) el.textContent = syncLabel();
}

function currentName() {
  const input = document.querySelector("#player-name");
  return input ? input.value : state.draftName;
}

function paintSheet() {
  const root = document.querySelector("#sheet-root");
  if (!root) return;
  if (!state.sheet) {
    root.hidden = true;
    root.innerHTML = "";
    document.body.classList.remove("lock");
    return;
  }
  document.body.classList.add("lock");
  root.hidden = false;
  root.innerHTML = state.sheet === "record" ? recordSheet() : sitSheet(currentName() || state.draftName);
  const input = root.querySelector("#player-name");
  if (input) {
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }
}

function sitSheet(name) {
  const title = state.sheet === "edit" ? "改一下" : "坐下";
  const picked = state.pickedAvatar || state.avatars[0]?.id || "";
  state.pickedAvatar = picked;
  const codeLine = state.sheet === "sit"
    ? `<button type="button" class="code-inline" data-action="copy-code">房间号 ${esc(formatCode(state.code))}，点此复制</button>`
    : "";
  return `<div class="backdrop" data-action="close-sheet"><div class="sheet" data-action="hold">
    <div class="grabber"></div>
    <div class="sheet-head"><h2>${title}</h2><button type="button" data-action="close-sheet">关闭</button></div>
    ${codeLine}
    <form data-form="sit">
      <label class="field-label" for="player-name">名字</label>
      <input id="player-name" type="text" maxlength="12" autocomplete="nickname" placeholder="怎么称呼" value="${esc(name || "")}" />
      <p class="field-label">选一个头像</p>
      <div class="picker">${state.avatars.map((avatar) => avatarButton(avatar.id, { pressed: avatar.id === picked, action: "pick-avatar" })).join("")}</div>
      <p id="sheet-error" class="sheet-error">${esc(state.error)}</p>
      <button type="submit" class="btn ink block">${state.sheet === "edit" ? "保存" : "坐下"}</button>
    </form>
  </div></div>`;
}

function recordSheet() {
  const { kind, winnerId, payerId, points } = state.record;
  const players = state.room?.players || [];
  const choices = (action, selected) => players.map((player) => `<button type="button" class="pick" data-action="${action}" data-id="${esc(player.id)}" aria-pressed="${player.id === selected ? "true" : "false"}"><span class="avatar">${avatarSvg(player.avatar)}</span><small>${esc(player.name)}</small></button>`).join("");
  const pointBlock = kind === "manual"
    ? players.map((player) => `<div class="manual-row"><span class="avatar">${avatarSvg(player.avatar)}</span><strong>${esc(player.name)}</strong><div class="manual-steps"><div class="stepper"><button type="button" data-action="step" data-id="${esc(player.id)}" data-by="-10">-10</button><button type="button" data-action="step" data-id="${esc(player.id)}" data-by="-1">-1</button></div><b data-delta="${esc(player.id)}">${esc(formatDelta(state.record.deltas[player.id] || 0))}</b><div class="stepper"><button type="button" data-action="step" data-id="${esc(player.id)}" data-by="1">+1</button><button type="button" data-action="step" data-id="${esc(player.id)}" data-by="10">+10</button></div></div></div>`).join("")
    : kind === "draw"
      ? ""
      : `<p class="points" id="points-display">${esc(points || "0")}</p>
        <div class="chips">${QUICK_POINTS.map((n) => `<button type="button" data-action="chip" data-points="${n}">${n}</button>`).join("")}</div>
        <div class="keypad">${[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"], ["7", "7"], ["8", "8"], ["9", "9"], ["00", "00"], ["0", "0"], ["back", "删"]].map(([key, label]) => `<button type="button" data-action="digit" data-key="${key}">${label}</button>`).join("")}</div>`;
  const who = kind === "draw" || kind === "manual"
    ? ""
    : `<p class="field-label">谁胡了</p><div class="choices">${choices("pick-winner", winnerId)}</div>${kind === "dianpao" ? `<p class="field-label">谁点炮</p><div class="choices">${choices("pick-payer", payerId)}</div>` : ""}`;
  return `<div class="backdrop" data-action="close-sheet"><div class="sheet" data-action="hold">
    <div class="grabber"></div>
    <div class="sheet-head"><h2>记一局</h2><button type="button" data-action="close-sheet">关闭</button></div>
    <div class="segment">${[["zimo", "自摸"], ["dianpao", "点炮"], ["manual", "手动"], ["draw", "流局"]].map(([id, label]) => `<button type="button" data-action="kind" data-kind="${id}" aria-pressed="${kind === id ? "true" : "false"}">${label}</button>`).join("")}</div>
    ${who}
    ${pointBlock}
    <input id="round-note" class="note" maxlength="30" placeholder="备注，例如 清一色" value="${esc(state.record.note)}" />
    <p class="preview" id="preview">${esc(previewText())}</p>
    <p id="sheet-error" class="sheet-error">${esc(state.error)}</p>
    <div class="sheet-actions">
      <button type="button" class="btn ink block" id="commit-round" data-action="commit" ${canCommit() && !state.busy ? "" : "disabled"}>确认入账</button>
    </div>
  </div></div>`;
}

function syncRecord() {
  const display = document.querySelector("#points-display");
  if (display) display.textContent = state.record.points || "0";
  const preview = document.querySelector("#preview");
  if (preview) preview.textContent = previewText();
  document.querySelectorAll("[data-delta]").forEach((el) => {
    el.textContent = formatDelta(state.record.deltas[el.getAttribute("data-delta")] || 0);
  });
  document.querySelectorAll("[data-action='pick-winner']").forEach((el) => {
    el.setAttribute("aria-pressed", el.getAttribute("data-id") === state.record.winnerId ? "true" : "false");
  });
  document.querySelectorAll("[data-action='pick-payer']").forEach((el) => {
    el.setAttribute("aria-pressed", el.getAttribute("data-id") === state.record.payerId ? "true" : "false");
  });
  const commit = document.querySelector("#commit-round");
  if (commit) commit.disabled = !canCommit() || state.busy;
}

function openSit() {
  state.sheet = "sit";
  state.editingId = "";
  state.draftName = "";
  state.pickedAvatar = state.avatars[0]?.id || "";
  state.error = "";
  paintSheet();
}

function openEdit(id) {
  const player = state.room?.players.find((item) => item.id === id);
  if (!player) return;
  state.sheet = "edit";
  state.editingId = id;
  state.draftName = player.name;
  state.pickedAvatar = player.avatar;
  state.error = "";
  paintSheet();
}

function openRecord() {
  if (!state.room || state.room.players.length < 2 || !canManage()) return;
  const deltas = {};
  for (const player of state.room.players) deltas[player.id] = 0;
  state.record = { ...emptyRecord(), deltas };
  state.recordPlayerKey = state.room.players.map((player) => player.id).join();
  state.sheet = "record";
  state.error = "";
  paintSheet();
}

function closeSheet() {
  state.sheet = null;
  state.error = "";
  paintSheet();
}

async function createRoom(button) {
  if (state.busy) return;
  state.busy = true;
  if (button) button.disabled = true;
  try {
    const data = await request("/api/rooms", { method: "POST", body: "{}" });
    state.session = { hostToken: data.hostToken, players: {} };
    state.code = data.code;
    saveSession();
    location.hash = `#/r/${data.code}`;
  } catch (error) {
    state.busy = false;
    renderHome(error.message);
  }
}

function joinFromHome() {
  const code = normalizeCode(document.querySelector("#join-code")?.value || "");
  if (code.length !== 8) {
    renderHome("房间号是 8 位，像 K7M2-P9QX");
    return;
  }
  location.hash = `#/r/${code}`;
}

async function openRoom(code) {
  stopPoll();
  state.view = "table";
  state.code = code;
  state.session = loadSession(code);
  state.room = null;
  state.failed = "";
  state.sheet = null;
  state.undoArmed = false;
  state.pendingRemove = "";
  state.busy = false;
  renderTableShell();
  paintBoard();
  try {
    const data = await request(`/api/rooms/${code}`);
    if (state.code !== code || state.view !== "table") return;
    state.room = data.room;
    state.offline = false;
    remember(data.room);
    document.title = `麻将记分 · ${formatCode(code)}`;
    paintBoard();
    if (data.room.players.length === 0) openSit();
    startPoll();
  } catch (error) {
    if (state.code !== code) return;
    state.failed = error.message;
    paintBoard();
  }
}

async function submitSit() {
  const name = document.querySelector("#player-name")?.value || "";
  const avatar = state.pickedAvatar;
  if (!avatar) {
    showSheetError("请选一个头像");
    return;
  }
  if (state.busy) return;
  state.busy = true;
  const button = document.querySelector("[data-form='sit'] button[type='submit']");
  if (button) button.disabled = true;
  try {
    if (state.sheet === "edit") {
      const data = await request(`/api/rooms/${state.code}/players/${state.editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ name, avatar }),
      });
      state.room = data.room;
      toast("改好了");
    } else {
      const data = await request(`/api/rooms/${state.code}/players`, {
        method: "POST",
        body: JSON.stringify({ name, avatar }),
      });
      state.session.players[data.player.id] = data.token;
      saveSession();
      state.room = data.room;
      toast(`${data.player.name} 坐下了`);
    }
    remember(state.room);
    state.sheet = null;
    state.error = "";
    paintBoard();
    paintSheet();
  } catch (error) {
    showSheetError(error.message);
    if (button) button.disabled = false;
  } finally {
    state.busy = false;
  }
}

async function removePlayer(id) {
  if (state.pendingRemove !== id) {
    state.pendingRemove = id;
    paintBoard();
    return;
  }
  state.pendingRemove = "";
  if (state.busy) return;
  state.busy = true;
  try {
    const data = await request(`/api/rooms/${state.code}/players/${id}`, { method: "DELETE" });
    delete state.session.players[id];
    saveSession();
    state.room = data.room;
    remember(data.room);
    paintBoard();
    toast("已移出");
  } catch (error) {
    toast(error.message);
    paintBoard();
  } finally {
    state.busy = false;
  }
}

async function commitRound() {
  if (!canCommit() || state.busy) return;
  const { kind, winnerId, payerId, points, deltas, note } = state.record;
  const body = { kind, note };
  if (kind === "zimo") {
    body.winnerId = winnerId;
    body.points = Number(points);
  } else if (kind === "dianpao") {
    body.winnerId = winnerId;
    body.payerId = payerId;
    body.points = Number(points);
  } else if (kind === "manual") {
    body.deltas = {};
    for (const player of state.room.players) body.deltas[player.id] = deltas[player.id] || 0;
  }
  state.busy = true;
  syncRecord();
  try {
    const data = await request(`/api/rooms/${state.code}/rounds`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.room = data.room;
    state.sheet = null;
    state.error = "";
    remember(data.room);
    paintBoard();
    paintSheet();
    toast("这一局记下了");
    if (navigator.vibrate) navigator.vibrate(12);
  } catch (error) {
    showSheetError(error.message);
  } finally {
    state.busy = false;
    syncRecord();
  }
}

async function undoRound() {
  const latest = state.room?.rounds[0];
  if (!latest || state.busy) return;
  if (!state.undoArmed) {
    state.undoArmed = true;
    paintBoard();
    clearTimeout(state.undoTimer);
    state.undoTimer = setTimeout(() => {
      state.undoArmed = false;
      if (state.view === "table" && !state.sheet) paintBoard();
    }, 4000);
    return;
  }
  state.undoArmed = false;
  state.busy = true;
  try {
    const data = await request(`/api/rooms/${state.code}/rounds/${latest.id}`, { method: "DELETE" });
    state.room = data.room;
    remember(data.room);
    paintBoard();
    toast("已撤销上一局");
  } catch (error) {
    toast(error.message);
    paintBoard();
  } finally {
    state.busy = false;
  }
}

async function copyCode() {
  const text = formatCode(state.code);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  toast("房间号已复制");
}

function pushDigit(key) {
  if (key === "back") state.record.points = state.record.points.slice(0, -1);
  else {
    const next = `${state.record.points}${key}`.replace(/^0+/, "");
    if (next.length <= 6 && Number(next) <= 100000) state.record.points = next;
  }
  syncRecord();
}

function reconcileRecord() {
  if (state.sheet !== "record" || !state.room) return;
  const ids = new Set(state.room.players.map((player) => player.id));
  if (state.record.winnerId && !ids.has(state.record.winnerId)) state.record.winnerId = "";
  if (state.record.payerId && !ids.has(state.record.payerId)) state.record.payerId = "";
  for (const player of state.room.players) {
    if (state.record.deltas[player.id] === undefined) state.record.deltas[player.id] = 0;
  }
  const key = state.room.players.map((player) => player.id).join();
  if (key !== state.recordPlayerKey) {
    state.recordPlayerKey = key;
    paintSheet();
  } else syncRecord();
}

async function refreshRoom() {
  if (state.view !== "table" || !state.code || state.busy) return;
  try {
    const data = await request(`/api/rooms/${state.code}`);
    if (state.code !== data.room.code) return;
    state.offline = false;
    const same = JSON.stringify(data.room) === JSON.stringify(state.room);
    state.room = data.room;
    if (!same) {
      remember(data.room);
      paintBoard();
      reconcileRecord();
    } else paintSync();
  } catch {
    state.offline = true;
    paintSync();
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

function onClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.getAttribute("data-action");
  if (action === "hold") return;
  if (action === "create-room") createRoom(target);
  else if (action === "open-recent") location.hash = `#/r/${normalizeCode(target.getAttribute("data-code"))}`;
  else if (action === "home") {
    stopPoll();
    document.title = "麻将记分";
    location.hash = "#/";
  }
  else if (action === "copy-code") copyCode();
  else if (action === "open-sit") openSit();
  else if (action === "edit-player") openEdit(target.getAttribute("data-id"));
  else if (action === "remove-player") removePlayer(target.getAttribute("data-id"));
  else if (action === "open-record") openRecord();
  else if (action === "undo") undoRound();
  else if (action === "close-sheet") closeSheet();
  else if (action === "pick-avatar") {
    state.draftName = currentName();
    state.pickedAvatar = target.getAttribute("data-avatar");
    paintSheet();
  }
  else if (action === "kind") {
    state.record.kind = target.getAttribute("data-kind");
    state.record.note = document.querySelector("#round-note")?.value || state.record.note;
    state.error = "";
    paintSheet();
  }
  else if (action === "pick-winner") {
    state.record.winnerId = target.getAttribute("data-id");
    if (state.record.payerId === state.record.winnerId) state.record.payerId = "";
    syncRecord();
  }
  else if (action === "pick-payer") {
    state.record.payerId = target.getAttribute("data-id");
    if (state.record.payerId === state.record.winnerId) state.record.winnerId = "";
    syncRecord();
  }
  else if (action === "digit") pushDigit(target.getAttribute("data-key"));
  else if (action === "chip") {
    state.record.points = String(target.getAttribute("data-points"));
    syncRecord();
  }
  else if (action === "step") {
    const id = target.getAttribute("data-id");
    const next = (state.record.deltas[id] || 0) + Number(target.getAttribute("data-by"));
    if (Math.abs(next) <= 1000000) state.record.deltas[id] = next;
    syncRecord();
  }
  else if (action === "commit") commitRound();
}

function onSubmit(event) {
  if (event.target.matches("[data-form='join']")) {
    event.preventDefault();
    joinFromHome();
  } else if (event.target.matches("[data-form='sit']")) {
    event.preventDefault();
    submitSit();
  }
}

function onInput(event) {
  if (event.target.id === "round-note") state.record.note = event.target.value;
  if (event.target.id === "player-name") state.draftName = event.target.value;
}

function route() {
  const match = location.hash.match(/^#\/r\/([A-Za-z0-9-]+)$/);
  const code = match ? normalizeCode(match[1]) : "";
  if (code.length === 8) {
    if (state.view === "table" && state.code === code && (state.room || state.failed)) return;
    openRoom(code);
    return;
  }
  stopPoll();
  state.view = "home";
  state.sheet = null;
  state.code = "";
  document.title = "麻将记分";
  renderHome();
}

async function boot() {
  try {
    state.avatars = await request("/avatars.json");
  } catch {
    state.avatars = [];
  }
  if (!Array.isArray(state.avatars) || state.avatars.length === 0) {
    state.avatars = [];
    state.homeError = "头像没有加载出来，请刷新再试";
  }
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("submit", onSubmit);
  document.body.addEventListener("input", onInput);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshRoom();
  });
  window.addEventListener("hashchange", route);
  route();
}

boot();
