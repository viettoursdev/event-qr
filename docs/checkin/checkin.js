import { firebaseConfig, staffEmail, eventName, demoGuests } from "./config.js";

const DEMO = !firebaseConfig || !firebaseConfig.apiKey;
const SDK = "https://www.gstatic.com/firebasejs/10.12.0";

// ---------- tiện ích ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// bỏ dấu tiếng Việt + lowercase để tìm không phân biệt dấu
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
const digits = (s) => String(s || "").replace(/\D/g, "");

function fmtTime(t) {
  if (!t) return "";
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}

// ---------- trạng thái ----------
let guests = []; // [{id, stt, name, company, phone, table, checkedIn, checkinAt, checkinBy, _n}]
let station = localStorage.getItem("checkin.station") || "";
let store = null; // lớp truy cập dữ liệu (demo hoặc firebase)

// ---------- khởi tạo ----------
$("eventName").textContent = eventName;
$("brandName").textContent = eventName;
if (DEMO) $("demoNote").hidden = false;
if (station) $("station").value = station;

// ========================================================
//  LỚP DỮ LIỆU
// ========================================================
function makeDemoStore() {
  let data = demoGuests.map((g) => ({ ...g, checkedIn: false, checkinAt: null, checkinBy: null }));
  let cb = () => {};
  return {
    async login() {
      return true;
    }, // demo: chấp nhận mọi PIN
    subscribe(fn) {
      cb = fn;
      fn(data.slice());
    },
    async setCheckin(id, on) {
      const g = data.find((x) => x.id === id);
      if (g) {
        g.checkedIn = on;
        g.checkinAt = on ? new Date() : null;
        g.checkinBy = on ? station : null;
      }
      cb(data.slice());
    },
    async setConfirm(id, on) {
      const g = data.find((x) => x.id === id);
      if (g) {
        g.confirmed = on;
        g.confirmedAt = on ? new Date() : null;
        g.confirmedVia = on ? "staff" : null;
      }
      cb(data.slice());
    },
    async logout() {},
  };
}

async function makeFirebaseStore() {
  const { initializeApp } = await import(`${SDK}/firebase-app.js`);
  const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } =
    await import(`${SDK}/firebase-auth.js`);
  const { getFirestore, collection, onSnapshot, doc, updateDoc, serverTimestamp } = await import(
    `${SDK}/firebase-firestore.js`
  );

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);

  return {
    onAuth(fn) {
      onAuthStateChanged(auth, (u) => fn(!!u));
    },
    async login(pin) {
      await signInWithEmailAndPassword(auth, staffEmail, pin);
      return true;
    },
    subscribe(fn) {
      onSnapshot(collection(db, "guests"), (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        fn(arr);
      });
    },
    async setCheckin(id, on) {
      await updateDoc(doc(db, "guests", id), {
        checkedIn: on,
        checkinAt: on ? serverTimestamp() : null,
        checkinBy: on ? station : null,
      });
    },
    async setConfirm(id, on) {
      await updateDoc(doc(db, "guests", id), {
        confirmed: on,
        confirmedAt: on ? serverTimestamp() : null,
        confirmedVia: on ? "staff" : null,
      });
    },
    async logout() {
      await signOut(auth);
    },
  };
}

// ========================================================
//  ĐĂNG NHẬP
// ========================================================
async function init() {
  store = DEMO ? makeDemoStore() : await makeFirebaseStore();

  // Firebase: tự vào lại nếu phiên còn hiệu lực
  if (!DEMO && store.onAuth) {
    store.onAuth((isIn) => {
      if (isIn && $("app").hidden) enterApp();
    });
  }

  $("loginBtn").addEventListener("click", doLogin);
  $("pin").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
}

async function doLogin() {
  const pin = $("pin").value.trim();
  station = $("station").value.trim();
  $("loginError").textContent = "";
  if (!station) return ($("loginError").textContent = "Vui lòng nhập tên quầy/máy.");
  if (!pin) return ($("loginError").textContent = "Vui lòng nhập mã nhân viên.");
  localStorage.setItem("checkin.station", station);
  $("loginBtn").disabled = true;
  try {
    await store.login(pin);
    if (DEMO) enterApp();
  } catch (e) {
    $("loginError").textContent = "Mã không đúng. Vui lòng thử lại.";
  } finally {
    $("loginBtn").disabled = false;
  }
}

let entered = false;
function enterApp() {
  if (entered) return;
  entered = true;
  $("login").hidden = true;
  $("app").hidden = false;
  $("stationTag").textContent = station || "—";
  store.subscribe(onData);
  const s = $("search");
  s.addEventListener("input", render);
  $("clearSearch").addEventListener("click", () => {
    s.value = "";
    $("clearSearch").hidden = true;
    s.focus();
    render();
  });
  $("logoutBtn").addEventListener("click", async () => {
    await store.logout();
    location.reload();
  });
  setTimeout(() => s.focus(), 100);
}

// ========================================================
//  DỮ LIỆU + HIỂN THỊ
// ========================================================
function onData(arr) {
  guests = arr
    .map((g) => ({
      ...g,
      _n: norm(`${g.name} ${g.company}`),
      _phone: digits(g.phone),
    }))
    .sort((a, b) => (a.stt || 0) - (b.stt || 0));
  const done = guests.filter((g) => g.checkedIn).length;
  $("countDone").textContent = done;
  $("countTotal").textContent = guests.length;
  const cf = $("countConfirm");
  if (cf) cf.textContent = guests.filter((g) => g.confirmed).length;
  render();
}

function search(q) {
  const nq = norm(q);
  const dq = digits(q);
  if (!nq && !dq) return [];
  const tokens = nq.split(" ").filter(Boolean);
  return guests.filter((g) => {
    const textOk = tokens.every((t) => g._n.includes(t));
    const phoneOk = dq.length >= 2 && g._phone.includes(dq);
    // nếu truy vấn là số -> ưu tiên khớp SĐT; nếu là chữ -> khớp tên/công ty
    if (dq.length >= 2 && /^\d+$/.test(q.trim())) return phoneOk;
    return textOk || phoneOk;
  });
}

function render() {
  const q = $("search").value;
  $("clearSearch").hidden = !q;
  const box = $("results");

  if (!q.trim()) {
    box.innerHTML = `<div class="hint">Nhập tên, số điện thoại hoặc công ty để tìm khách.</div>`;
    return;
  }
  const matches = search(q);
  if (matches.length === 0) {
    box.innerHTML = `<div class="hint">Không tìm thấy khách phù hợp với “${esc(q)}”.</div>`;
    return;
  }

  const dup = matches.length > 1;
  const head = `<div class="result-head">${matches.length} kết quả${
    dup ? ` — chọn đúng khách (trùng tên thì xem công ty / SĐT / bàn)` : ""
  }</div>`;
  box.innerHTML = head + matches.slice(0, 60).map(card).join("");

  box.querySelectorAll("[data-checkin]").forEach((btn) =>
    btn.addEventListener("click", () => toggleCheckin(btn.getAttribute("data-checkin"), true))
  );
  box.querySelectorAll("[data-undo]").forEach((btn) =>
    btn.addEventListener("click", () => toggleCheckin(btn.getAttribute("data-undo"), false))
  );
  box.querySelectorAll("[data-confirm]").forEach((btn) =>
    btn.addEventListener("click", () => toggleConfirm(btn.getAttribute("data-confirm"), true))
  );
  box.querySelectorAll("[data-unconfirm]").forEach((btn) =>
    btn.addEventListener("click", () => toggleConfirm(btn.getAttribute("data-unconfirm"), false))
  );
}

function confirmBadge(g) {
  return g.confirmed
    ? `<span class="badge confirm-yes">✓ Đã xác nhận</span>`
    : `<span class="badge confirm-no">Chưa xác nhận</span>`;
}

function confirmBtn(g) {
  return g.confirmed
    ? `<button class="btn-confirm on" data-unconfirm="${esc(g.id)}">Bỏ xác nhận</button>`
    : `<button class="btn-confirm" data-confirm="${esc(g.id)}">Xác nhận</button>`;
}

function card(g) {
  const phone = g.phone ? esc(g.phone) : "—";
  const table = g.table ? `Bàn ${esc(g.table)}` : "Chưa xếp bàn";
  const ciBtn = g.checkedIn
    ? `<button class="btn-undo" data-undo="${esc(g.id)}">Hoàn tác</button>`
    : `<button class="btn-checkin" data-checkin="${esc(g.id)}">Check-in</button>`;
  const ciInfo = g.checkedIn
    ? `<div class="ci-info">Lúc ${fmtTime(g.checkinAt)}${g.checkinBy ? " · " + esc(g.checkinBy) : ""}</div>`
    : "";
  const ciTag = g.checkedIn ? `<span class="badge ok">✓ Đã check-in</span> ` : "";
  return `<div class="card${g.checkedIn ? " done" : ""}">
    <div class="card-main">
      <div class="name">${esc(g.name)} ${ciTag}${confirmBadge(g)}</div>
      <div class="sub">${esc(g.company || "")}</div>
      <div class="meta"><span>📞 ${phone}</span><span>🍽 ${table}</span></div>
      ${ciInfo}
    </div>
    <div class="card-actions">${confirmBtn(g)}${ciBtn}</div>
  </div>`;
}

async function toggleCheckin(id, on) {
  const g = guests.find((x) => x.id === id);
  if (on && g && g.checkedIn) {
    flash(`${g.name} đã được check-in trước đó (${fmtTime(g.checkinAt)}${g.checkinBy ? " · " + g.checkinBy : ""}).`);
    return;
  }
  try {
    await store.setCheckin(id, on);
    if (on && g) flash(`✓ Đã check-in: ${g.name}`);
  } catch (e) {
    flash("Lỗi khi lưu, vui lòng thử lại.", true);
  }
}

async function toggleConfirm(id, on) {
  const g = guests.find((x) => x.id === id);
  try {
    await store.setConfirm(id, on);
    if (g) flash(on ? `✓ Đã xác nhận: ${g.name}` : `Đã bỏ xác nhận: ${g.name}`);
  } catch (e) {
    flash("Lỗi khi lưu, vui lòng thử lại.", true);
  }
}

let flashTimer;
function flash(msg, isError) {
  const bar = $("statusbar");
  bar.textContent = msg;
  bar.className = "statusbar" + (isError ? " err" : " ok");
  bar.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (bar.hidden = true), 2600);
}

init();
