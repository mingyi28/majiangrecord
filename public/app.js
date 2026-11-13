const WINDS = ["东", "南", "西", "北"];
const ROUND_WINDOW_MS = 60 * 1000;
const ADMIN_LOGIN_MS = 30 * 24 * 60 * 60 * 1000;
let volatileAdminToken = "";

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
  editingRoundId: "",
  settlingRoundId: "",
  dialog: "",
  admin: null,
  adminMode: null,
  adminError: "",
  adminOpen: "",
  profileHistory: null,
  profileLoading: false,
  editingProfileId: "",
  homeError: "",
  busy: false,
  toastTimer: 0,
  pollTimer: 0,
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
  return `<button type="button" class="pick" data-action="pick" data-avatar="${esc(id)}" aria-pressed="${pressed ? "true" : "false"}" aria-label="${esc(label)}"><span class="avatar">${avatarSvg(id)}</span></button>`;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 5);
}

function formatDelta(value) {
  const number = Number(value) || 0;
  return number > 0 ? `+${number}` : String(number);
}

function roundDeadline(round) {
  const created = Date.parse(round?.createdAt || "");
  return Number.isFinite(created) ? created + ROUND_WINDOW_MS : 0;
}

function isSettling(round) {
  return roundDeadline(round) > Date.now();
}

function countdownTime(deadline) {
  const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function countdownMarkup(round, modal = false) {
  const deadline = roundDeadline(round);
  if (!deadline || deadline <= Date.now()) return modal ? "" : `<em class="settled-badge">已结算</em>`;
  return `<em class="settlement-countdown${modal ? " modal-countdown" : ""}" data-countdown="${deadline}" data-modal="${modal ? "true" : "false"}">${modal ? "对局结算中 " : "结算中 "}${countdownTime(deadline)}</em>`;
}

function updateCountdowns() {
  document.querySelectorAll("[data-countdown]").forEach((element) => {
    const deadline = Number(element.dataset.countdown);
    const modal = element.dataset.modal === "true";
    if (deadline > Date.now()) {
      element.textContent = `${modal ? "对局结算中 " : "结算中 "}${countdownTime(deadline)}`;
      return;
    }
    element.textContent = modal ? "结算时间已结束，保存后会标记为修改" : "已结算";
    element.classList.remove("settlement-countdown");
    element.classList.add("settled-badge");
  });
}

function roomStatusLabel(status) {
  if (status === "active") return "进行中";
  if (status === "ended") return "已关闭";
  if (status === "dissolved") return "已解散";
  return "历史";
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

function newLocalId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadProfiles() {
  const saved = readJsonStorage("mj.profiles", []);
  const profiles = Array.isArray(saved)
    ? saved.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.avatar === "string")
    : [];
  if (profiles.length) return profiles.slice(0, 12);
  try {
    const name = String(localStorage.getItem("mj.nickname") || "").trim().slice(0, 12);
    if (!name) return [];
    const migrated = [{ id: newLocalId(), name, avatar: "bunny", seats: {} }];
    writeJsonStorage("mj.profiles", migrated);
    localStorage.setItem("mj.activeProfile", migrated[0].id);
    return migrated;
  } catch {
    return [];
  }
}

function activeProfile() {
  const profiles = loadProfiles();
  let id = "";
  try {
    id = localStorage.getItem("mj.activeProfile") || "";
  } catch {
    // Use the first saved role.
  }
  return profiles.find((item) => item.id === id) || profiles[0] || null;
}

function setActiveProfile(id) {
  try {
    localStorage.setItem("mj.activeProfile", id);
  } catch {
    // The selected role still works for this visit.
  }
}

function saveProfile(name, avatar, id = "") {
  const profiles = loadProfiles();
  let profile = profiles.find((item) => item.id === id);
  if (!profile) {
    profile = { id: newLocalId(), name, avatar, seats: {} };
    profiles.push(profile);
  } else {
    profile.name = name;
    profile.avatar = avatar;
    if (!profile.seats || typeof profile.seats !== "object") profile.seats = {};
  }
  writeJsonStorage("mj.profiles", profiles.slice(0, 12));
  setActiveProfile(profile.id);
  try {
    localStorage.setItem("mj.nickname", name);
  } catch {
    // Kept in the profile cache when available.
  }
  return profile;
}

function rememberSeat(profileId, code, playerId) {
  const profiles = loadProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return;
  if (!profile.seats || typeof profile.seats !== "object") profile.seats = {};
  profile.seats[code] = playerId;
  writeJsonStorage("mj.profiles", profiles);
}

function setActiveRoom(profileId, code) {
  const profiles = loadProfiles();
  const profile = profiles.find((item) => item.id === profileId);
  if (!profile) return;
  profile.activeRoom = code || "";
  writeJsonStorage("mj.profiles", profiles);
}

function clearActiveRoom(code) {
  const profiles = loadProfiles();
  let changed = false;
  for (const profile of profiles) {
    if (profile.activeRoom === code) {
      profile.activeRoom = "";
      changed = true;
    }
  }
  if (changed) writeJsonStorage("mj.profiles", profiles);
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
    count: room.players.length,
    status: room.status || "active",
    at: Date.now(),
  });
  writeJsonStorage("mj.recents", recents.slice(0, 8));
}

function recentTime(value) {
  const date = new Date(Number(value) || 0);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  const time = date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (sameDay) return `今天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
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

function currentPlayerId() {
  const players = state.room?.players || [];
  const profile = activeProfile();
  const remembered = profile?.seats?.[state.code];
  if (remembered && state.session.players?.[remembered] && players.some((player) => player.id === remembered)) {
    return remembered;
  }
  const local = players.filter((player) => state.session.players?.[player.id]);
  return local.length === 1 ? local[0].id : "";
}

function playerName(id) {
  return state.room?.players.find((player) => player.id === id)?.name || "有人";
}

function adminToken() {
  try {
    const saved = JSON.parse(localStorage.getItem("mj.admin") || "null");
    if (saved && typeof saved.token === "string" && Number(saved.expiresAt) > Date.now()) {
      volatileAdminToken = saved.token;
      return saved.token;
    }
    localStorage.removeItem("mj.admin");
    const legacy = sessionStorage.getItem("mj.admin") || "";
    if (legacy) {
      saveAdminToken(legacy);
      sessionStorage.removeItem("mj.admin");
      return legacy;
    }
  } catch {
    // Fall back to this page's in-memory login when storage is unavailable.
  }
  return volatileAdminToken;
}

function saveAdminToken(value) {
  volatileAdminToken = value || "";
  try {
    if (value) {
      localStorage.setItem("mj.admin", JSON.stringify({
        token: value,
        expiresAt: Date.now() + ADMIN_LOGIN_MS,
      }));
    } else {
      localStorage.removeItem("mj.admin");
    }
    sessionStorage.removeItem("mj.admin");
  } catch {
    // The password still works for this page through memory.
  }
}

function isHost() {
  return Boolean(state.session.hostToken);
}

async function send(url, options, token) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("没有连上牌桌");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (data && data.error) throw new Error(data.error);
    if (response.status === 404) throw new Error("牌桌接口没有部署");
    throw new Error("没有连上牌桌");
  }
  return data || {};
}

function request(url, options = {}) {
  return send(url, options, authToken());
}

function adminRequest(url, options = {}) {
  return send(url, options, adminToken());
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
  if (text === "") return { ok: true, value: 0, empty: true };
  if (!/^\d+$/.test(text)) return { ok: false, value: 0, empty: false };
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0 || value > 1000000) return { ok: false, value: 0, empty: false };
  return { ok: true, value, empty: false };
}

function scoreState() {
  const players = state.room?.players || [];
  const selfId = currentPlayerId();
  const editing = Boolean(state.editingRoundId || state.settlingRoundId);
  let any = false;
  let bad = false;
  const deltas = {};
  for (const player of players) {
    if (player.id === selfId) {
      deltas[player.id] = 0;
      continue;
    }
    const parsed = parseScore(state.scores[player.id] ?? "");
    if (!parsed.ok) bad = true;
    deltas[player.id] = parsed.value;
    if (!parsed.empty && parsed.value !== 0) any = true;
  }
  let hint = "请填写分数";
  if (bad) hint = "只能输入 0 或正整数";
  return { ok: Boolean(selfId) && !bad && (any || editing) && players.length >= 2, deltas, hint };
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
  const profile = activeProfile();
  const allRecents = loadRecents();
  const activeCode = /^\d{5}$/.test(profile?.activeRoom || "") ? profile.activeRoom : "";
  const liveRoom = activeCode && state.code === activeCode && state.room?.status === "active" ? state.room : null;
  const cachedCurrent = allRecents.find((item) => item.code === activeCode);
  const currentNames = liveRoom ? liveRoom.players.map((player) => player.name) : (cachedCurrent?.names || []);
  const currentCount = liveRoom ? liveRoom.players.length : (cachedCurrent?.count || currentNames.length);
  const recents = allRecents.filter((item) => item.code !== activeCode).slice(0, activeCode ? 3 : 2);
  const recentHtml = recents.map((item) => `
    <button type="button" class="recent" data-action="open" data-code="${esc(item.code)}">
      <span class="recent-main"><b>${esc(item.code)}</b><small>${esc(item.names.join("、") || "还没有人")}</small></span>
      <em class="recent-status recent-status-${item.status === "active" ? "active" : item.status === "ended" ? "ended" : item.status === "dissolved" ? "dissolved" : "history"}">${roomStatusLabel(item.status)}</em>
      <time>${esc(recentTime(item.at))}</time>
      <i>›</i>
    </button>`).join("");
  const currentHtml = activeCode ? `
    <section class="current-room-card">
      <div>
        <small>当前房间 · 进行中</small>
        <strong>${esc(activeCode)}</strong>
        <span>${currentCount ? `${currentCount} 人 · ` : ""}${esc(currentNames.join("、") || "点击回到房间")}</span>
      </div>
      <button type="button" class="btn primary" data-action="open" data-code="${esc(activeCode)}">进入房间</button>
    </section>` : "";
  return `<div class="screen home">
    <header class="hero">
      <button type="button" class="role-button" data-action="role">
        ${profile ? `<span class="avatar">${avatarSvg(profile.avatar)}</span><span>${esc(profile.name)}</span>` : "角色"}
      </button>
      <p class="eyebrow">轻松开房间</p>
      <h1>麻将记分</h1>
      <p class="lede">五位数字进同一间，给每人直接填分数。</p>
    </header>
    <div class="body">
      ${currentHtml}
      ${activeCode ? "" : `<section class="launch-card">
        <div class="launch-profile">
          ${profile ? `<span class="avatar">${avatarSvg(profile.avatar)}</span><div><small>以这个角色进入</small><b>${esc(profile.name)}</b></div>` : `<div><small>第一次使用</small><b>先选一个喜欢的角色</b></div>`}
          <button type="button" class="link" data-action="role">${profile ? "切换" : "设置"}</button>
        </div>
        <button type="button" class="btn primary create-button" data-action="create"><span>开房间</span><small>创建房间并邀请朋友</small></button>
      </section>
      <section class="join-card">
        <div class="section-title"><b>加入房间</b><small>输入朋友分享的 5 位房间号</small></div>
        <form id="join-form" class="join-row">
          <input id="join-code" class="code-input" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="one-time-code" placeholder="00000" aria-label="五位数字房间号" required>
          <button class="btn mint" type="submit">进入</button>
        </form>
      </section>`}
      ${recentHtml ? `<section class="recent-section"><div class="section-title"><b>最近房间</b></div><div class="recents">${recentHtml}</div></section>` : ""}
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
      ${isHost() && state.room.status !== "dissolved" ? `<button type="button" class="home-link" data-action="ask-disband">解散</button>` : ""}
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
  const mine = currentPlayerId() === player.id;
  const wind = WINDS[(Math.max(player.seat, 1) - 1) % WINDS.length];
  const leader = leaderId() === player.id ? " leader" : "";
  const totalClass = player.total > 0 ? "up" : player.total < 0 ? "down" : "flat";
  const score = `<b class="total ${totalClass}">${esc(formatDelta(player.total))}</b>`;
  return `<li class="player${leader}">
    <span class="avatar">${avatarSvg(player.avatar)}</span>
    <div class="who">
      <strong>${esc(player.name)}</strong>
      <em>${wind}${mine ? `<span class="me">我</span>` : ""}</em>
    </div>
    ${score}
  </li>`;
}

function renderHistory() {
  const rounds = state.room.rounds || [];
  if (!rounds.length) return `<div class="history"><p class="hint">还没有对局。记一局时，给得分的人直接加分。</p></div>`;
  const lines = rounds.map((round) => {
    const parts = Object.entries(round.deltas || {})
      .filter(([, delta]) => delta)
      .map(([id, delta]) => `${playerName(id)} ${formatDelta(delta)}`);
    const edited = round.editedAt ? `<em class="edited-badge">已修改</em>` : "";
    const settlement = edited ? "" : state.room.status === "active" ? countdownMarkup(round) : `<em class="settled-badge">已结算</em>`;
    const content = `<b>第${round.seq}局</b><span>${esc(parts.join(" · ") || "分数没有变化")}</span>${settlement}${edited}`;
    return state.room.status === "active" && currentPlayerId()
      ? `<button type="button" class="round round-button" data-action="edit-round" data-round="${esc(round.id)}">${content}</button>`
      : `<p class="round">${content}</p>`;
  }).join("");
  return `<div class="history"><div class="history-head"><span>对局记录</span></div>${lines}</div>`;
}

function renderDock() {
  if (state.room.status === "dissolved") return `<p class="ended">这桌已经解散，记录留在管理端</p>`;
  if (state.room.status === "ended") return `<p class="ended">房间已关闭，今天的战斗结束了</p>`;
  const selfId = currentPlayerId();
  const seated = Boolean(selfId);
  const parts = [];
  if (!seated) parts.push(`<button type="button" class="btn mint" data-action="open-sit">坐下</button>`);
  if (canManage() && state.room.players.length >= 2) {
    parts.push(`<button type="button" class="btn ghost" data-action="ask-end">关闭房间</button>`);
  }
  if (selfId && state.room.players.length >= 2) {
    parts.push(`<button type="button" class="btn primary" data-action="open-record">记一局</button>`);
  } else if (seated) {
    parts.push(`<p class="ended">再等一位坐下就能记分</p>`);
  }
  return parts.join("");
}

function renderSettlement() {
  const ranked = state.room.players.slice().sort((a, b) => b.total - a.total || a.seat - b.seat);
  return `<section class="settlement-card">
    <div class="settlement-heading">
      <div><small>${state.room.status === "dissolved" ? "房间已解散" : "今日战斗结束"}</small><h2>${state.room.rounds.length} 局 · ${state.room.players.length} 位玩家</h2></div>
      <span>最终结算</span>
    </div>
    <div class="settlement-scores">${ranked.map((player, index) => `
      <div><i>${index + 1}</i><span class="avatar">${avatarSvg(player.avatar)}</span><b>${esc(player.name)}</b><strong class="${player.total > 0 ? "up" : ""}">${esc(formatDelta(player.total))}</strong></div>
    `).join("")}</div>
  </section>`;
}

function renderTable() {
  if (state.panel === "sit" || state.panel === "edit") return renderSeat();
  const count = `${state.room.players.length} 人`;
  const meta = state.room.status === "dissolved" ? "已解散" : state.room.status === "ended" ? "已关闭" : count;
  const active = state.room.status === "active";
  const disband = isHost() && active
    ? `<button type="button" class="room-link danger-link" data-action="ask-disband">解散</button>`
    : "";
  return `<div class="screen">
    <header class="top">
      <button type="button" class="home-link" data-action="home">首页</button>
      <span class="meta">${meta}</span>
      <div class="role-button compact role-display">
        ${activeProfile() ? `<span class="avatar">${avatarSvg(activeProfile().avatar)}</span><span>${esc(activeProfile().name)}</span>` : "未选择角色"}
      </div>
    </header>
    ${active ? `<div class="room-code-card">
      <button type="button" class="room-number" data-action="copy" aria-label="复制房间号">
        <small>房间号 · 点击复制</small>
        <strong>${esc(state.code)}</strong>
      </button>
      <div class="room-actions">
        <button type="button" class="room-link primary-link" data-action="share">分享</button>
        ${disband}
      </div>
    </div>` : renderSettlement()}
    <div class="body">
      <ul class="players">${state.room.players.map(renderPlayer).join("")}</ul>
      ${renderHistory()}
    </div>
    <div class="dock">${renderDock()}</div>
  </div>`;
}

function renderIdentityEditor({ title, copy, action, buttonText, cancelAction = "cancel-dialog" }) {
  return `<div class="modal-root">
    <div class="modal identity-modal" role="dialog" aria-modal="true">
      <h2>${title}</h2>
      ${copy ? `<p>${copy}</p>` : ""}
      <input id="identity-name" class="name-input" maxlength="12" autocomplete="nickname" placeholder="你的称呼" value="${esc(state.draftName)}" aria-label="称呼">
      <div class="picks roomy">${state.avatars.map((avatar) => avatarButton(avatar.id)).join("")}</div>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-action="${cancelAction}">取消</button>
        <button type="button" class="btn primary" data-action="${action}">${buttonText}</button>
      </div>
    </div>
  </div>`;
}

function renderRoleModal() {
  const profile = activeProfile();
  const profiles = loadProfiles();
  const history = state.profileHistory;
  const choices = profiles.map((item) => `
    <div class="profile-choice${profile && item.id === profile.id ? " active" : ""}">
      <button type="button" class="profile-select" data-action="switch-profile" data-profile="${esc(item.id)}">
        <span class="avatar">${avatarSvg(item.avatar)}</span>
        <span>${esc(item.name)}</span>
      </button>
      <button type="button" class="profile-edit-button" data-action="edit-profile" data-profile="${esc(item.id)}">修改</button>
    </div>`).join("");
  const stats = state.profileLoading
    ? `<div class="profile-stats skeleton-stats">${[1, 2, 3].map(() => `<div><i></i><span></span></div>`).join("")}</div>`
    : history
    ? `<div class="profile-stats">
        <div><b>${history.rooms}</b><span>房间</span></div>
        <div><b>${history.rounds}</b><span>对局</span></div>
        <div><b>${formatDelta(history.total)}</b><span>总分</span></div>
      </div>`
    : `<p class="hint">还没有历史战绩</p>`;
  const records = state.profileLoading
    ? `<div class="profile-records skeleton-records">${[1, 2].map(() => `<div><i></i><span></span><i></i></div>`).join("")}</div>`
    : history && history.records.length
    ? `<div class="profile-records">${history.records.map((item) => `
        <div><b>${esc(item.code)}</b><span>${item.rounds} 局</span><strong class="${item.total > 0 ? "up" : item.total < 0 ? "down" : ""}">${esc(formatDelta(item.total))}</strong></div>
      `).join("")}</div>`
    : "";
  return `<div class="modal-root">
    <div class="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="role-title">
      <div class="modal-heading">
        <h2 id="role-title">我的角色</h2>
        <button type="button" class="close-button" data-action="cancel-dialog" aria-label="关闭">×</button>
      </div>
      ${profile ? "" : `<p class="hint">还没有角色，先新建一个吧。</p>`}
      ${choices ? `<div class="profile-choices">${choices}</div>` : ""}
      <button type="button" class="link add-profile" data-action="new-profile">＋ 新角色</button>
      <h3>历史战绩</h3>
      ${stats}
      ${records}
      <button type="button" class="btn mint feedback-entry" data-action="open-feedback">意见反馈</button>
    </div>
  </div>`;
}

function renderModal() {
  if (state.dialog === "record") {
    const parsed = scoreState();
    const selfId = currentPlayerId();
    const otherPlayers = state.room.players.filter((player) => player.id !== selfId);
    const editingRound = state.room.rounds.find((round) => round.id === state.editingRoundId);
    const settlingRound = state.room.rounds.find((round) => round.id === state.settlingRoundId);
    const targetRound = editingRound || settlingRound;
    return `<div class="modal-root">
      <div class="modal score-modal" role="dialog" aria-modal="true" aria-labelledby="score-title">
        <div class="modal-heading">
          <div><h2 id="score-title">${editingRound ? `修改第${editingRound.seq}局` : settlingRound ? `第${settlingRound.seq}局结算` : "记一局"}</h2></div>
          <button type="button" class="close-button" data-action="cancel-dialog" aria-label="关闭">×</button>
        </div>
        ${settlingRound ? countdownMarkup(settlingRound, true) : ""}
        <div class="score-list">${otherPlayers.map((player) => `
          <label class="score-row">
            <span class="avatar">${avatarSvg(player.avatar)}</span>
            <span class="score-person"><b>${esc(player.name)}</b><small>当前 ${formatDelta(player.total)}</small></span>
            <span class="score-box"><i>＋</i><input class="score-input" type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="done" autocomplete="off" data-player="${esc(player.id)}" value="${esc(state.scores[player.id] || "")}" placeholder="0" aria-label="给${esc(player.name)}增加的分数"></span>
          </label>`).join("")}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-action="cancel-dialog">取消</button>
          <button type="button" class="btn primary" data-action="commit" ${parsed.ok ? "" : "disabled"}>${editingRound ? "保存修改" : targetRound ? "更新本局" : "记下这局"}</button>
        </div>
      </div>
    </div>`;
  }
  if (state.dialog === "create") {
    return renderIdentityEditor({
      title: "开房间",
      copy: "确认你的称呼和头像，进入后把房间号告诉朋友。",
      action: "confirm-create",
      buttonText: "进入房间",
    });
  }
  if (state.dialog === "profile") return renderRoleModal();
  if (state.dialog === "profile-edit") {
    return renderIdentityEditor({
      title: state.editingProfileId ? "修改角色" : "新角色",
      copy: "",
      action: "save-profile",
      buttonText: "保存",
      cancelAction: "cancel-profile-edit",
    });
  }
  if (state.dialog === "feedback") {
    return `<div class="modal-root">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <h2 id="feedback-title">意见反馈</h2>
        <p>你的建议会交给管理端查看。</p>
        <textarea id="feedback-message" maxlength="300" placeholder="写下你希望改进的地方"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-action="back-role">返回</button>
          <button type="button" class="btn primary" data-action="send-feedback">提交</button>
        </div>
      </div>
    </div>`;
  }
  if (state.dialog === "end") {
    return `<div class="modal-root">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="end-title">
        <h2 id="end-title">关闭房间？</h2>
        <p>关闭表示今天的战斗结束了。之后不能再记分，将展示最终结算。</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-action="cancel-dialog">再玩一会儿</button>
          <button type="button" class="btn primary" data-action="confirm-end">确认关闭</button>
        </div>
      </div>
    </div>`;
  }
  if (state.dialog === "disband") {
    return `<div class="modal-root">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="disband-title">
        <h2 id="disband-title">解散这桌？</h2>
        <p>开错房间可以用这个。解散后不能再记分，记录会留在管理端。</p>
        <div class="modal-actions">
          <button type="button" class="btn ghost" data-action="cancel-dialog">再想想</button>
          <button type="button" class="btn primary" data-action="confirm-disband">解散</button>
        </div>
      </div>
    </div>`;
  }
  return "";
}

function paint() {
  const app = document.querySelector("#app");
  const view = state.view === "admin" ? renderAdmin() : state.view === "home" ? `${renderHome()}${renderModal()}` : `${renderTable()}${renderModal()}`;
  app.innerHTML = view;
  if (state.dialog === "record") updateSum();
  updateCountdowns();
}

async function guard(fn) {
  if (state.busy) return;
  state.busy = true;
  const app = document.querySelector("#app");
  if (app) app.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (error) {
    toast(error.message || "没有连上牌桌");
  } finally {
    state.busy = false;
    if (app) app.removeAttribute("aria-busy");
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
    const profile = saveProfile(name, state.pickedAvatar, state.editingProfileId || activeProfile()?.id || "");
    if (profile.activeRoom) {
      state.dialog = "";
      toast(`你还在房间 ${profile.activeRoom}`);
      openRoom(profile.activeRoom);
      return;
    }
    const data = await request("/api/rooms", { method: "POST", body: "{}" });
    state.code = data.code;
    state.session = { hostToken: data.hostToken, players: {} };
    saveSession();
    state.room = data.room;
    const seated = await request(`/api/rooms/${data.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name, avatar: state.pickedAvatar, profileId: profile.id }),
    });
    state.session.players[seated.player.id] = seated.token;
    rememberSeat(profile.id, data.code, seated.player.id);
    setActiveRoom(profile.id, data.code);
    saveSession();
    state.room = seated.room;
    state.view = "table";
    state.panel = null;
    state.dialog = "";
    history.replaceState(null, "", `#/r/${data.code}`);
    remember(seated.room);
    paint();
    startPoll();
  });
}

async function loadRoom(code) {
  stopPoll();
  state.code = code;
  state.session = loadSession(code);
  state.view = "table";
  state.panel = null;
  state.dialog = "";
  try {
    const data = await request(`/api/rooms/${code}`);
    state.room = data.room;
    const profile = activeProfile();
    const rememberedId = profile?.seats?.[code];
    const alreadySeated = Boolean(
      rememberedId
      && state.session.players?.[rememberedId]
      && state.room.players.some((player) => player.id === rememberedId)
    );
    if (state.room.status === "active" && profile && !alreadySeated) {
      if (profile.activeRoom && profile.activeRoom !== code) {
        throw new Error(`你还在房间 ${profile.activeRoom}，请先关闭后再加入`);
      }
      const seated = await request(`/api/rooms/${code}/players`, {
        method: "POST",
        body: JSON.stringify({
          name: profile.name,
          avatar: profile.avatar,
          profileId: profile.id,
        }),
      });
      state.session.players[seated.player.id] = seated.token;
      rememberSeat(profile.id, code, seated.player.id);
      setActiveRoom(profile.id, code);
      saveSession();
      state.room = seated.room;
    } else if (state.room.status === "active" && profile && alreadySeated) {
      setActiveRoom(profile.id, code);
    } else if (state.room.status !== "active") {
      clearActiveRoom(code);
    }
    remember(state.room);
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

async function refreshActiveRoomOnHome() {
  const profile = activeProfile();
  if (!profile) return;
  let code = profile.activeRoom || "";
  if (!/^\d{5}$/.test(code)) {
    const sessions = readJsonStorage("mj.sessions", {});
    const candidates = loadRecents().filter((recent) => {
      const playerId = profile.seats?.[recent.code];
      return playerId && sessions[recent.code]?.players?.[playerId];
    });
    for (const recent of candidates) {
      try {
        const data = await send(`/api/rooms/${recent.code}`, {}, "");
        const playerId = profile.seats?.[recent.code];
        if (data.room.status === "active" && data.room.players.some((player) => player.id === playerId)) {
          code = recent.code;
          setActiveRoom(profile.id, code);
          remember(data.room);
          if (state.view === "home" && activeProfile()?.id === profile.id) paint();
          return;
        }
      } catch {
        // Keep checking older rooms saved on this device.
      }
    }
    return;
  }
  try {
    const data = await send(`/api/rooms/${code}`, {}, "");
    remember(data.room);
    if (data.room.status !== "active") clearActiveRoom(code);
    if (state.view === "home" && activeProfile()?.id === profile.id) paint();
  } catch (error) {
    if (/找不到/.test(error.message)) {
      clearActiveRoom(code);
      if (state.view === "home") paint();
    }
  }
}

async function refreshRoom() {
  if (document.hidden || state.view !== "table" || !state.code) return;
  try {
    const data = await request(`/api/rooms/${state.code}`);
    const previousIds = (state.room?.players || []).map((player) => player.id).join();
    const previousRound = state.room?.rounds?.[0];
    const previousRoundKey = previousRound ? `${previousRound.id}:${previousRound.updatedAt || previousRound.createdAt}` : "";
    const previousStatus = state.room?.status;
    state.room = data.room;
    const nextIds = data.room.players.map((player) => player.id).join();
    const nextRound = data.room.rounds[0];
    const nextRoundKey = nextRound ? `${nextRound.id}:${nextRound.updatedAt || nextRound.createdAt}` : "";
    if (data.room.status !== "active") clearActiveRoom(state.code);
    if (previousIds !== nextIds || previousRoundKey !== nextRoundKey || previousStatus !== data.room.status) {
      remember(data.room);
    }
    if ((data.room.status === "ended" || data.room.status === "dissolved") && state.dialog === "record") {
      state.dialog = "";
      state.editingRoundId = "";
      state.settlingRoundId = "";
      state.scores = {};
      paint();
      return;
    }
    if (state.dialog === "record") {
      if (previousIds === nextIds && previousRoundKey === nextRoundKey && previousStatus === data.room.status) return;
      for (const player of data.room.players) {
        if (state.scores[player.id] == null) state.scores[player.id] = "";
      }
      paint();
      return;
    }
    if (state.panel === "sit" || state.panel === "edit" || state.dialog) return;
    if (previousIds === nextIds && previousRoundKey === nextRoundKey && previousStatus === data.room.status) return;
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
    const profile = saveProfile(name, state.pickedAvatar, activeProfile()?.id || "");
    if (profile.activeRoom && profile.activeRoom !== state.code) {
      toast(`你还在房间 ${profile.activeRoom}，请先结束后再加入`);
      return;
    }
    const data = await request(`/api/rooms/${state.code}/players`, {
      method: "POST",
      body: JSON.stringify({ name, avatar: state.pickedAvatar, profileId: profile.id }),
    });
    state.session.players[data.player.id] = data.token;
    rememberSeat(profile.id, state.code, data.player.id);
    setActiveRoom(profile.id, state.code);
    saveSession();
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
    const profile = activeProfile();
    if (profile && localIds().has(state.editingId)) saveProfile(name, state.pickedAvatar, profile.id);
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

function openRecord(roundId = "") {
  if ((state.room?.players.length || 0) < 2) {
    toast("至少两位才能记分");
    return;
  }
  if (!currentPlayerId()) {
    toast("请先以自己的角色坐下");
    return;
  }
  state.dialog = "record";
  const requested = roundId
    ? state.room.rounds.find((item) => item.id === roundId)
    : state.room.rounds[0];
  const settlingRound = requested && isSettling(requested) ? requested : null;
  state.settlingRoundId = settlingRound?.id || "";
  state.editingRoundId = roundId && !settlingRound ? roundId : "";
  state.scores = {};
  for (const player of state.room.players) state.scores[player.id] = "";
  const targetRound = settlingRound || (roundId ? requested : null);
  if (targetRound) {
    const selfId = currentPlayerId();
    const entry = targetRound.entries?.find((item) => item.actorId === selfId);
    for (const [playerId, delta] of Object.entries(entry?.deltas || {})) {
      if (playerId !== selfId && delta) state.scores[playerId] = String(delta);
    }
  }
  paint();
  focusSoon(".score-input");
}

async function commitScores() {
  const parsed = scoreState();
  const selfId = currentPlayerId();
  const settlingRound = state.room?.rounds.find((round) => round.id === state.settlingRoundId);
  const expiredSettlementId = settlingRound && !isSettling(settlingRound) ? settlingRound.id : "";
  const roundId = state.editingRoundId || expiredSettlementId;
  if (!parsed.ok) {
    toast(parsed.hint);
    return;
  }
  await guard(async () => {
    const data = await send(`/api/rooms/${state.code}/rounds${roundId ? `/${roundId}` : ""}`, {
      method: roundId ? "PATCH" : "POST",
      body: JSON.stringify({ kind: "award", deltas: parsed.deltas }),
    }, state.session.players[selfId]);
    state.room = data.room;
    state.dialog = "";
    state.editingRoundId = "";
    state.settlingRoundId = "";
    state.scores = {};
    remember(data.room);
    paint();
    toast(roundId ? "修改好了" : settlingRound ? "本局已更新" : "记下了");
  });
}

async function confirmEnd() {
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}/end`, { method: "POST", body: "{}" });
    state.room = data.room;
    clearActiveRoom(state.code);
    remember(data.room);
    state.dialog = "";
    state.panel = null;
    paint();
    toast("房间已关闭");
  });
}

async function confirmDisband() {
  await guard(async () => {
    const data = await request(`/api/rooms/${state.code}`, { method: "DELETE" });
    state.room = data.room;
    clearActiveRoom(state.code);
    remember(data.room);
    state.dialog = "";
    state.panel = null;
    paint();
    toast("这桌已解散");
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

async function shareRoom() {
  const text = `来一起记分，房间号 ${state.code}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: "麻将记分", text, url: location.href });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${location.href}`);
    toast("邀请信息已复制");
  } catch {
    toast(`房间号 ${state.code}`);
  }
}

function prepareIdentity(profile = activeProfile()) {
  state.draftName = profile ? profile.name : "";
  state.pickedAvatar = profile ? profile.avatar : (state.avatars[0]?.id || "");
  state.editingProfileId = profile ? profile.id : "";
}

function focusSoon(selector) {
  requestAnimationFrame(() => {
    const element = document.querySelector(selector);
    if (element) element.focus();
  });
}

async function loadProfileHistory() {
  const profile = activeProfile();
  state.profileHistory = null;
  if (!profile) {
    state.profileLoading = false;
    paint();
    return;
  }
  state.profileLoading = true;
  paint();
  const sessions = readJsonStorage("mj.sessions", {});
  const recents = loadRecents().slice(0, 8);
  const records = [];
  await Promise.all(recents.map(async (recent) => {
    try {
      const data = await send(`/api/rooms/${recent.code}`, {}, "");
      const room = data.room;
      const localIdsForRoom = new Set(Object.keys(sessions[recent.code]?.players || {}));
      const rememberedId = profile.seats && profile.seats[recent.code];
      const player = room.players.find((item) => item.id === rememberedId)
        || room.players.find((item) => localIdsForRoom.has(item.id) && item.name === profile.name && item.avatar === profile.avatar);
      if (!player) return;
      records.push({
        code: room.code,
        total: player.total,
        rounds: room.rounds.filter((round) => Object.prototype.hasOwnProperty.call(round.deltas || {}, player.id)).length,
        at: Date.parse(room.createdAt) || 0,
      });
    } catch {
      // A deleted or unavailable room is skipped from this phone's history.
    }
  }));
  records.sort((a, b) => b.at - a.at);
  state.profileHistory = {
    rooms: records.length,
    rounds: records.reduce((sum, item) => sum + item.rounds, 0),
    total: records.reduce((sum, item) => sum + item.total, 0),
    records,
  };
  state.profileLoading = false;
  paint();
}

function openRole() {
  state.dialog = "profile";
  state.profileHistory = null;
  state.profileLoading = Boolean(activeProfile());
  paint();
  loadProfileHistory();
}

function saveRole() {
  const name = cleanDraft();
  if (!name) {
    toast("先写一个称呼");
    return;
  }
  if (!state.pickedAvatar) {
    toast("选一个头像");
    return;
  }
  saveProfile(name, state.pickedAvatar, state.editingProfileId);
  state.dialog = "profile";
  state.editingProfileId = "";
  paint();
  loadProfileHistory();
}

async function sendFeedback() {
  const field = document.querySelector("#feedback-message");
  const message = field ? field.value.trim() : "";
  if (!message) {
    toast("请写下你的意见");
    return;
  }
  await guard(async () => {
    const profile = activeProfile();
    await send("/api/feedback", {
      method: "POST",
      body: JSON.stringify({
        name: profile?.name || "",
        roomCode: state.view === "table" ? state.code : "",
        message,
      }),
    }, "");
    state.dialog = "profile";
    paint();
    toast("谢谢你的建议");
  });
}

function onClick(event) {
  const button = event.target.closest("[data-action]");
  if (!button || !document.querySelector("#app").contains(button)) {
    if (event.target.classList && event.target.classList.contains("modal-root")) {
      state.dialog = state.dialog === "profile-edit" ? "profile" : "";
      state.editingProfileId = "";
      state.editingRoundId = "";
      state.settlingRoundId = "";
      paint();
    }
    return;
  }
  const action = button.dataset.action;
  if (action === "create") {
    prepareIdentity();
    state.dialog = "create";
    paint();
    focusSoon("#identity-name");
  }
  else if (action === "open") openRoom(button.dataset.code || "");
  else if (action === "home") {
    stopPoll();
    state.view = "home";
    state.panel = null;
    state.dialog = "";
    location.hash = "#/";
    paint();
  } else if (action === "copy") copyCode();
  else if (action === "share") shareRoom();
  else if (action === "role") openRole();
  else if (action === "open-sit") {
    state.panel = "sit";
    prepareIdentity();
    paint();
    const input = document.querySelector("#seat-name");
    if (input) input.focus();
  } else if (action === "close-panel") {
    state.panel = null;
    state.scores = {};
    paint();
  } else if (action === "pick") {
    state.pickedAvatar = button.dataset.avatar || "";
    document.querySelectorAll(".pick").forEach((item) => {
      item.setAttribute("aria-pressed", item === button ? "true" : "false");
    });
  } else if (action === "save-sit") saveSit();
  else if (action === "open-record") openRecord();
  else if (action === "edit-round") openRecord(button.dataset.round || "");
  else if (action === "commit") commitScores();
  else if (action === "confirm-create") createRoom();
  else if (action === "edit-profile") {
    const profile = loadProfiles().find((item) => item.id === button.dataset.profile) || activeProfile();
    prepareIdentity(profile);
    state.dialog = "profile-edit";
    paint();
    focusSoon("#identity-name");
  } else if (action === "new-profile") {
    prepareIdentity(null);
    state.dialog = "profile-edit";
    paint();
    focusSoon("#identity-name");
  } else if (action === "save-profile") saveRole();
  else if (action === "switch-profile") {
    setActiveProfile(button.dataset.profile || "");
    state.profileHistory = null;
    state.profileLoading = true;
    paint();
    loadProfileHistory();
  } else if (action === "open-feedback") {
    state.dialog = "feedback";
    paint();
    focusSoon("#feedback-message");
  } else if (action === "back-role") {
    state.dialog = "profile";
    paint();
  } else if (action === "send-feedback") sendFeedback();
  else if (action === "ask-end") {
    state.dialog = "end";
    paint();
  } else if (action === "cancel-dialog") {
    state.dialog = "";
    state.editingRoundId = "";
    state.settlingRoundId = "";
    paint();
  } else if (action === "cancel-profile-edit") {
    state.dialog = "profile";
    state.editingProfileId = "";
    paint();
  } else if (action === "confirm-end") confirmEnd();
  else if (action === "confirm-disband") confirmDisband();
  else if (action === "ask-disband") {
    state.dialog = "disband";
    paint();
  } else if (action === "toggle-room") {
    state.adminOpen = state.adminOpen === button.dataset.code ? "" : button.dataset.code || "";
    paint();
  } else if (action === "admin-out") {
    saveAdminToken("");
    state.admin = null;
    state.adminError = "";
    loadAdmin();
  }
}

function onInput(event) {
  if (event.target.id === "join-code") {
    const next = digits(event.target.value);
    if (next !== event.target.value) event.target.value = next;
    return;
  }
  if (event.target.id === "seat-name" || event.target.id === "identity-name") {
    state.draftName = event.target.value.slice(0, 12);
    return;
  }
  if (event.target.classList.contains("score-input")) {
    const id = event.target.dataset.player;
    const value = event.target.value.replace(/\D/g, "").slice(0, 7);
    if (value !== event.target.value) event.target.value = value;
    state.scores[id] = value;
    updateSum();
  }
}

function onSubmit(event) {
  if (event.target.id === "join-form") {
    event.preventDefault();
    const input = event.target.querySelector("input");
    openRoom(digits(input.value));
    return;
  }
  if (event.target.id === "admin-setup" || event.target.id === "admin-login") {
    event.preventDefault();
    const password = event.target.password.value;
    submitAdmin(event.target.id === "admin-setup", password);
  }
}

function onKeydown(event) {
  if (event.key === "Escape" && state.dialog) {
    state.dialog = state.dialog === "profile-edit" ? "profile" : "";
    state.editingProfileId = "";
    paint();
    return;
  }
  if (event.key !== "Enter") return;
  if (event.target.id === "seat-name") {
    event.preventDefault();
    if (state.panel === "edit") saveEdit();
    else saveSit();
  } else if (event.target.id === "identity-name") {
    event.preventDefault();
    if (state.dialog === "create") createRoom();
    else saveRole();
  } else if (event.target.classList.contains("score-input")) {
    event.preventDefault();
    commitScores();
  }
}

function statusLabel(status) {
  if (status === "dissolved") return "已解散";
  if (status === "ended") return "已结束";
  return "进行中";
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function roundLine(room, round) {
  const names = Object.fromEntries(room.players.map((player) => [player.id, player.name]));
  const parts = Object.entries(round.deltas || {})
    .filter(([, delta]) => delta)
    .map(([id, delta]) => `${names[id] || "有人"} ${formatDelta(delta)}`);
  return parts.join(" · ") || "分数没有变化";
}

function renderAdmin() {
  const summary = state.admin && state.admin.summary;
  const leaderboard = (state.admin && state.admin.leaderboard) || [];
  const cards = summary
    ? `<div class="stats">
        ${[
          ["累计房间", summary.rooms],
          ["进行中", summary.active],
          ["已完成", summary.ended],
          ["已解散", summary.dissolved],
          ["参赛人次", summary.players],
          ["累计对局", summary.rounds],
        ].map(([label, value]) => `<div class="stat"><b>${esc(value)}</b><span>${label}</span></div>`).join("")}
      </div>`
    : "";
  const ranking = leaderboard.length
    ? `<div class="ranking-list">${leaderboard.map((player) => `
        <article class="ranking-row">
          <span class="rank rank-${player.rank}">${player.rank}</span>
          <span class="avatar">${avatarSvg(player.avatar)}</span>
          <div class="ranking-person">
            <b>${esc(player.name)}</b>
            <small>${player.rooms} 个房间 · ${player.rounds} 局 · ${player.wins} 胜</small>
          </div>
          <div class="ranking-rate"><b>${esc(`${player.winRate}%`)}</b><small>胜率</small></div>
          <strong class="${player.total > 0 ? "up" : player.total < 0 ? "down" : ""}">${esc(formatDelta(player.total))}</strong>
        </article>`).join("")}</div>`
    : `<p class="empty-state">完成对局后，这里会出现天梯排名。</p>`;
  const rooms = (state.admin && state.admin.rooms) || [];
  const feedback = (state.admin && state.admin.feedback) || [];
  const list = rooms.length
    ? rooms.map((room) => {
        const open = state.adminOpen === room.code;
        const people = room.players.map((player) => `<li><span>${esc(player.name)}</span><b class="${player.total > 0 ? "up" : player.total < 0 ? "down" : ""}">${esc(formatDelta(player.total))}</b></li>`).join("");
        const rounds = open
          ? room.rounds.map((round) => `<p class="round"><b>第${round.seq}局</b><span>${esc(roundLine(room, round))}</span>${round.editedAt ? `<em class="edited-badge">已修改</em>` : ""}</p>`).join("")
          : "";
        return `<article class="room-card${open ? " open" : ""}">
          <header>
            <div><b>${esc(room.code)}</b><span class="status status-${esc(room.status)}">${statusLabel(room.status)}</span></div>
            <small>${esc(formatWhen(room.createdAt))}</small>
          </header>
          <ul>${people || "<li><span>还没有人坐下</span></li>"}</ul>
          <button type="button" class="room-detail-button" data-action="toggle-room" data-code="${esc(room.code)}">${room.roundCount} 局 · ${open ? "收起详情" : "查看详情"}</button>
          ${rounds}
        </article>`;
      }).join("")
    : state.admin ? `<p class="empty-state">还没有房间记录。</p>` : "";
  const feedbackList = feedback.length
    ? `${feedback.map((item) => `
        <article class="feedback-card">
          <header><b>${esc(item.name || "匿名")}</b><small>${esc(formatWhen(item.createdAt))}${item.roomCode ? ` · ${esc(item.roomCode)}` : ""}</small></header>
          <p>${esc(item.message)}</p>
        </article>`).join("")}`
    : `<p class="empty-state">暂时没有新反馈。</p>`;
  let gate = "";
  if (!state.admin) {
    if (state.adminMode && state.adminMode.unavailable) {
      gate = `<p class="hint">${esc(state.adminMode.unavailable)}</p>`;
    } else if (state.adminMode && state.adminMode.needsSetup) {
      gate = `<form id="admin-setup" class="stack">
        <label for="admin-password">设置管理口令</label>
        <input id="admin-password" name="password" type="password" minlength="8" maxlength="64" autocomplete="new-password" placeholder="8 到 64 位英文、数字或符号">
        <button class="btn primary" type="submit">保存并进入</button>
      </form>`;
    } else {
      gate = `<form id="admin-login" class="stack">
        <label for="admin-password">管理口令</label>
        <input id="admin-password" name="password" type="password" maxlength="64" autocomplete="current-password">
        <button class="btn primary" type="submit">进入</button>
      </form>`;
    }
  }
  return `<div class="screen admin">
    <header class="admin-header">
      <div><p class="eyebrow">MAHJONG SCORE</p><h1>管理看板</h1></div>
      ${state.admin ? `<button type="button" class="link" data-action="admin-out">退出</button>` : ""}
    </header>
    <div class="body">
      ${state.admin ? `
        <section class="admin-block overview-block">
          <div class="admin-title"><div><h2>对局概览</h2><p>房间、参赛和完成情况</p></div><small>实时汇总</small></div>
          ${cards}
        </section>
        <div class="admin-columns">
          <section class="admin-block ranking-block">
            <div class="admin-title"><div><h2>天梯排行榜</h2><p>按累计总分排名，同分时胜局更多者优先</p></div></div>
            ${ranking}
          </section>
          <section class="admin-block rooms-block">
            <div class="admin-title"><div><h2>对局情况</h2><p>查看每个房间、玩家总分和逐局明细</p></div><small>最近 100 个</small></div>
            <div class="admin-room-list">${list}</div>
          </section>
        </div>
        <section class="admin-block feedback-block">
          <div class="admin-title"><div><h2>意见反馈</h2><p>玩家从角色面板提交的建议</p></div></div>
          <div class="feedback-list">${feedbackList}</div>
        </section>
      ` : `<section class="admin-login"><h2>管理端登录</h2><p>输入管理口令查看对局数据。</p>${gate}</section>`}
      <p class="error">${esc(state.adminError)}</p>
    </div>
  </div>`;
}

async function loadAdmin() {
  try {
    if (!adminToken()) {
      state.admin = null;
      state.adminMode = await adminRequest("/api/admin/status");
      state.adminError = "";
      paint();
      return;
    }
    state.admin = await adminRequest("/api/admin/overview");
    state.adminError = "";
    paint();
  } catch (error) {
    if (/口令/.test(error.message)) saveAdminToken("");
    state.admin = null;
    state.adminError = error.message;
    if (!state.adminMode) state.adminMode = { needsSetup: false };
    paint();
  }
}

async function submitAdmin(setup, password) {
  await guard(async () => {
    if (setup) await adminRequest("/api/admin/setup", { method: "POST", body: JSON.stringify({ password }) });
    saveAdminToken(password);
    await loadAdmin();
  });
}

function route() {
  if (location.pathname === "/admin" || location.hash === "#/admin") {
    if (location.hash === "#/admin") history.replaceState(null, "", "/admin");
    document.title = "管理看板 · 麻将记分";
    stopPoll();
    state.view = "admin";
    state.dialog = "";
    paint();
    loadAdmin();
    return;
  }
  document.title = "麻将记分";
  const match = location.hash.match(/^#\/r\/(\d{5})$/);
  if (!match) {
    stopPoll();
    state.view = "home";
    state.panel = null;
    state.dialog = "";
    paint();
    refreshActiveRoomOnHome();
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
    if (!document.hidden) {
      refreshRoom();
      updateCountdowns();
    }
  });
  setInterval(updateCountdowns, 1000);
  route();
}

boot();
