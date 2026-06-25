import { firebaseConfig, eventName, demoGuests, collectionName } from "./config.js?v=3";

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
let guests = []; // [{id, stt, name, company, phone, table, checkedIn, checkinAt, checkinBy, confirmed, _n}]
let store = null; // lớp truy cập dữ liệu (demo hoặc firebase)
let checkinFilter = ""; // "" | "done" | "undone"
let confirmFilter = ""; // "" | "done" | "undone"
let vegFilter = false; // chỉ hiện khách ăn chay
let cancelFilter = false; // chỉ hiện khách xác nhận huỷ (không tham gia)
let showDashboard = false; // bảng thống kê
const ADMIN_EMAIL = "checkin.admin@viettours.local";
const VIEWONLY_EMAIL = "checkin.viewonly@viettours.local";
let isAdmin = false;
let isViewOnly = false; // tài khoản chỉ xem — không được chỉnh sửa
let locks = { checkin: false, confirm: false, vegetarian: false }; // Admin khoá thao tác của Operations
const lockedFor = (f) => locks[f] && !isAdmin; // Operations bị chặn nếu Admin khoá

// nhãn quầy/máy hiển thị, suy ra từ email đăng nhập (vd checkin.may04@... -> may04)
const labelFromEmail = (e) => (e ? (e.split("@")[0].replace(/^checkin\./i, "") || e) : "");
let loginEmail = localStorage.getItem("checkin.email") || "";
let station = labelFromEmail(loginEmail);

// ---------- khởi tạo ----------
$("eventName").textContent = eventName;
$("brandName").textContent = eventName;
if (DEMO) $("demoNote").hidden = false;
if (loginEmail) $("station").value = loginEmail;

// ========================================================
//  LỚP DỮ LIỆU
// ========================================================
function makeDemoStore() {
  let data = demoGuests.map((g) => ({ ...g, checkedIn: false, checkinAt: null, checkinBy: null }));
  let cb = () => {};
  return {
    async login() {
      return true;
    }, // demo: chấp nhận mọi tài khoản
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
        g.confirmedVia = on ? station : null;
      }
      cb(data.slice());
    },
    async setVegetarian(id, on) {
      const g = data.find((x) => x.id === id);
      if (g) {
        g.vegetarian = on;
        g.vegetarianAt = on ? new Date() : null;
        g.vegetarianVia = on ? station : null;
      }
      cb(data.slice());
    },
    async setCancel(id, on) {
      const g = data.find((x) => x.id === id);
      if (g) {
        g.cancelled = on;
        g.cancelledAt = on ? new Date() : null;
        g.cancelledVia = on ? station : null;
      }
      cb(data.slice());
    },
    async restore(id, fields) {
      const g = data.find((x) => x.id === id);
      if (g) Object.assign(g, fields);
      cb(data.slice());
    },
    subscribeConfig(fn) {
      demoLocksCb = fn;
      fn(demoLocks);
    },
    async setLocks(obj) {
      Object.assign(demoLocks, obj);
      demoLocksCb({ ...demoLocks });
    },
    async logout() {},
  };
}
const demoLocks = { checkin: false, confirm: false, vegetarian: false };
let demoLocksCb = () => {};

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
    async login(email, pin) {
      await signInWithEmailAndPassword(auth, email, pin);
      return true;
    },
    subscribe(fn) {
      onSnapshot(collection(db, collectionName), (snap) => {
        const arr = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        fn(arr);
      });
    },
    async setCheckin(id, on) {
      await updateDoc(doc(db, collectionName, id), {
        checkedIn: on,
        checkinAt: on ? serverTimestamp() : null,
        checkinBy: on ? station : null,
      });
    },
    async setConfirm(id, on) {
      await updateDoc(doc(db, collectionName, id), {
        confirmed: on,
        confirmedAt: on ? serverTimestamp() : null,
        confirmedVia: on ? station : null, // ghi máy lễ tân thao tác
      });
    },
    async setVegetarian(id, on) {
      await updateDoc(doc(db, collectionName, id), {
        vegetarian: on,
        vegetarianAt: on ? serverTimestamp() : null,
        vegetarianVia: on ? station : null, // ghi máy lễ tân thao tác
      });
    },
    async setCancel(id, on) {
      await updateDoc(doc(db, collectionName, id), {
        cancelled: on,
        cancelledAt: on ? serverTimestamp() : null,
        cancelledVia: on ? station : null, // ghi máy admin thao tác
      });
    },
    async restore(id, fields) {
      await updateDoc(doc(db, collectionName, id), fields);
    },
    subscribeConfig(fn) {
      onSnapshot(doc(db, "event_config", "locks"), (snap) => fn(snap.exists() ? snap.data() : {}));
    },
    async setLocks(obj) {
      await updateDoc(doc(db, "event_config", "locks"), obj);
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
  loginEmail = $("station").value.trim();
  station = labelFromEmail(loginEmail);
  $("loginError").textContent = "";
  if (!loginEmail) return ($("loginError").textContent = "Vui lòng nhập email tài khoản máy.");
  if (!pin) return ($("loginError").textContent = "Vui lòng nhập mật khẩu.");
  localStorage.setItem("checkin.email", loginEmail);
  isAdmin = loginEmail.toLowerCase() === ADMIN_EMAIL;
  isViewOnly = loginEmail.toLowerCase() === VIEWONLY_EMAIL;
  $("loginBtn").disabled = true;
  try {
    await store.login(loginEmail, pin);
    if (DEMO) enterApp();
  } catch (e) {
    const code = (e && e.code) || "";
    $("loginError").textContent = /user-not-found|invalid-email/.test(code)
      ? "Email tài khoản không tồn tại. Kiểm tra lại."
      : "Email hoặc mật khẩu không đúng. Vui lòng thử lại.";
  } finally {
    $("loginBtn").disabled = false;
  }
}

let entered = false;
function enterApp() {
  if (entered) return;
  entered = true;
  isAdmin = loginEmail.toLowerCase() === ADMIN_EMAIL; // cũng đúng khi tự vào lại phiên cũ
  isViewOnly = loginEmail.toLowerCase() === VIEWONLY_EMAIL;
  $("login").hidden = true;
  $("app").hidden = false;
  $("stationTag").textContent = station || "—";
  if (isAdmin) {
    $("adminBar").hidden = false;
    $("stationTag").textContent = station + " · ADMIN";
  }
  if (isViewOnly) {
    // Chỉ xem: gắn nhãn + ẩn các nút có thể chỉnh sửa (Nhập backup). Vẫn xem/tìm/lọc/thống kê/tải backup.
    $("stationTag").textContent = station + " · CHỈ XEM";
    $("btnImport").hidden = true;
    $("importFile").disabled = true;
  }
  store.subscribe(onData);
  if (store.subscribeConfig) store.subscribeConfig(onLocks);
  bindAdminBar();
  const s = $("search");
  s.addEventListener("input", render);
  $("clearSearch").addEventListener("click", () => {
    s.value = "";
    $("clearSearch").hidden = true;
    s.focus();
    render();
  });
  const sStt = $("searchStt");
  sStt.addEventListener("input", render);
  $("clearStt").addEventListener("click", () => {
    sStt.value = "";
    $("clearStt").hidden = true;
    sStt.focus();
    render();
  });
  const toggleFilter = (cur, val) => (cur === val ? "" : val);
  $("fChkDone").addEventListener("click", () => {
    checkinFilter = toggleFilter(checkinFilter, "done");
    render();
  });
  $("fChkUndone").addEventListener("click", () => {
    checkinFilter = toggleFilter(checkinFilter, "undone");
    render();
  });
  $("fCfmDone").addEventListener("click", () => {
    confirmFilter = toggleFilter(confirmFilter, "done");
    render();
  });
  $("fCfmUndone").addEventListener("click", () => {
    confirmFilter = toggleFilter(confirmFilter, "undone");
    render();
  });
  $("fVeg").addEventListener("click", () => {
    vegFilter = !vegFilter;
    render();
  });
  $("fCancel").addEventListener("click", () => {
    cancelFilter = !cancelFilter;
    render();
  });
  $("btnDash").addEventListener("click", () => {
    showDashboard = !showDashboard;
    $("btnDash").classList.toggle("active", showDashboard);
    render();
  });
  $("btnExport").addEventListener("click", exportBackup);
  $("btnImport").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) importBackup(f);
    e.target.value = "";
  });
  $("logoutBtn").addEventListener("click", async () => {
    await store.logout();
    location.reload();
  });
  setTimeout(() => s.focus(), 100);
}

// ---------- Khoá thao tác (Admin điều khiển, Operations tuân theo) ----------
function onLocks(l) {
  locks = {
    checkin: !!(l && l.checkin),
    confirm: !!(l && l.confirm),
    vegetarian: !!(l && l.vegetarian),
  };
  updateAdminBar();
  render();
}
function updateAdminBar() {
  const set = (id, feat, label) => {
    const b = $(id);
    if (!b) return;
    const on = locks[feat];
    b.textContent = `${label}: ${on ? "🔒 Đang khoá" : "🔓 Đang mở"}`;
    b.classList.toggle("locked", on);
  };
  set("lockCheckin", "checkin", "Check-in");
  set("lockConfirm", "confirm", "Xác nhận");
  set("lockVeg", "vegetarian", "Ăn chay");
}
function bindAdminBar() {
  if (!isAdmin) return;
  const tog = (feat) => () => store.setLocks && store.setLocks({ [feat]: !locks[feat] });
  $("lockCheckin").addEventListener("click", tog("checkin"));
  $("lockConfirm").addEventListener("click", tog("confirm"));
  $("lockVeg").addEventListener("click", tog("vegetarian"));
  $("btnResetAll").addEventListener("click", resetAll);
}

async function resetAll() {
  if (!isAdmin) return;
  const dirty = guests.filter((g) => g.checkedIn || g.confirmed || g.vegetarian || g.cancelled);
  if (!dirty.length) return flash("Tất cả đã ở trạng thái 0 — không cần reset.");
  if (!confirm(`⚠️ XOÁ TOÀN BỘ check-in / xác nhận / ăn chay / xác nhận huỷ của ${dirty.length} khách về 0?\n\nKhông thể hoàn tác. (Nên bấm "⬇ Backup" trước.)`)) return;
  if (!confirm(`Xác nhận LẦN CUỐI: reset ${dirty.length} khách về 0?`)) return;
  const clear = {
    checkedIn: false, checkinAt: null, checkinBy: null,
    confirmed: false, confirmedAt: null, confirmedVia: null,
    vegetarian: false, vegetarianAt: null, vegetarianVia: null,
    cancelled: false, cancelledAt: null, cancelledVia: null,
  };
  flash(`Đang reset ${dirty.length} khách…`);
  let ok = 0;
  for (const g of dirty) {
    try {
      await store.restore(g.id, clear);
      ok++;
    } catch (_) {}
  }
  flash(`✓ Đã reset ${ok}/${dirty.length} khách về 0.`, ok < dirty.length);
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
  const conf = guests.filter((g) => g.confirmed).length;
  $("countDone").textContent = done;
  $("countTotal").textContent = guests.length;
  const cf = $("countConfirm");
  if (cf) cf.textContent = conf;
  const setChip = (id, n) => {
    const el = $(id);
    if (el) el.textContent = `(${n})`;
  };
  setChip("cChkDone", done);
  setChip("cChkUndone", guests.length - done);
  setChip("cCfmDone", conf);
  setChip("cCfmUndone", guests.length - conf);
  setChip("cVeg", guests.filter((g) => g.vegetarian).length);
  setChip("cCancel", guests.filter((g) => g.cancelled).length);
  render();
}

// Ô tìm thường: chỉ tên / công ty / SĐT (KHÔNG tìm theo STT)
function search(q) {
  const raw = q.trim();
  const nq = norm(q);
  const dq = digits(q);
  if (!nq && !dq) return [];
  const tokens = nq.split(" ").filter(Boolean);
  const isNumeric = raw !== "" && /^\d+$/.test(raw);
  return guests.filter((g) => {
    const textOk = tokens.length > 0 && tokens.every((t) => g._n.includes(t));
    const phoneOk = dq.length >= 2 && g._phone.includes(dq);
    if (isNumeric) return phoneOk; // gõ số -> chỉ khớp SĐT
    return textOk || phoneOk;
  });
}

// Ô tìm STT: chỉ khớp theo STT (bằng đúng hoặc bắt đầu bằng)
function sttMatch(g, qStt) {
  const stt = String(g.stt == null ? "" : g.stt).trim();
  return stt !== "" && (stt === qStt || stt.startsWith(qStt));
}

function render() {
  const q = $("search").value;
  const qStt = $("searchStt").value.trim();
  $("clearSearch").hidden = !q;
  $("clearStt").hidden = !qStt;
  const box = $("results");
  if (showDashboard) {
    box.innerHTML = renderDashboard();
    return;
  }
  $("fChkDone").classList.toggle("active", checkinFilter === "done");
  $("fChkUndone").classList.toggle("active", checkinFilter === "undone");
  $("fCfmDone").classList.toggle("active", confirmFilter === "done");
  $("fCfmUndone").classList.toggle("active", confirmFilter === "undone");
  $("fVeg").classList.toggle("active", vegFilter);
  $("fCancel").classList.toggle("active", cancelFilter);
  const anyFilter = checkinFilter || confirmFilter || vegFilter || cancelFilter;

  // nhãn các bộ lọc đang bật
  const fl = [];
  if (checkinFilter) fl.push(checkinFilter === "done" ? "đã check-in" : "chưa check-in");
  if (confirmFilter) fl.push(confirmFilter === "done" ? "đã xác nhận" : "chưa xác nhận");
  if (vegFilter) fl.push("ăn chay");
  if (cancelFilter) fl.push("xác nhận huỷ");

  const hasQ = !!q.trim();
  const hasStt = !!qStt;
  let list;
  if (hasQ || hasStt) {
    list = hasQ ? search(q) : guests.slice();
    if (hasStt) list = list.filter((g) => sttMatch(g, qStt));
  } else if (anyFilter) {
    list = guests.slice();
  } else {
    box.innerHTML = `<div class="hint">Nhập tên / SĐT / công ty ở ô trái, hoặc STT ở ô phải để tìm khách.</div>`;
    return;
  }

  if (checkinFilter) list = list.filter((g) => (checkinFilter === "done" ? g.checkedIn : !g.checkedIn));
  if (confirmFilter) list = list.filter((g) => (confirmFilter === "done" ? g.confirmed : !g.confirmed));
  if (vegFilter) list = list.filter((g) => g.vegetarian);
  if (cancelFilter) list = list.filter((g) => g.cancelled);

  if (list.length === 0) {
    const term = hasStt ? `STT “${esc(qStt)}”` : `“${esc(q)}”`;
    const empty = hasQ || hasStt ? `Không tìm thấy khách phù hợp với ${term}.` : "Không có khách nào khớp bộ lọc. 🎉";
    box.innerHTML = `<div class="hint">${empty}</div>`;
    return;
  }

  const cap = 100;
  const dup = (hasQ || hasStt) && list.length > 1;
  let label;
  if (hasQ || hasStt) {
    label = `${list.length} kết quả${fl.length ? ` · lọc: ${fl.join(" & ")}` : dup ? " — chọn đúng khách (trùng tên thì xem công ty / SĐT / bàn)" : ""}`;
  } else {
    label = `${list.length} khách ${fl.join(" & ")}`;
  }
  const head = `<div class="result-head">${label}${list.length > cap ? ` (hiện ${cap} đầu)` : ""}</div>`;
  box.innerHTML = head + list.slice(0, cap).map(card).join("");

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
  box.querySelectorAll("[data-veg]").forEach((btn) =>
    btn.addEventListener("click", () => toggleVeg(btn.getAttribute("data-veg"), true))
  );
  box.querySelectorAll("[data-unveg]").forEach((btn) =>
    btn.addEventListener("click", () => toggleVeg(btn.getAttribute("data-unveg"), false))
  );
  box.querySelectorAll("[data-cancel]").forEach((btn) =>
    btn.addEventListener("click", () => toggleCancel(btn.getAttribute("data-cancel"), true))
  );
  box.querySelectorAll("[data-uncancel]").forEach((btn) =>
    btn.addEventListener("click", () => toggleCancel(btn.getAttribute("data-uncancel"), false))
  );
}

function statCard(label, n, sub) {
  return `<div class="stat"><div class="stat-num">${n}</div><div class="stat-label">${esc(label)}${sub ? ` · ${esc(sub)}` : ""}</div></div>`;
}
function renderDashboard() {
  const total = guests.length;
  const ci = guests.filter((g) => g.checkedIn).length;
  const cf = guests.filter((g) => g.confirmed).length;
  const veg = guests.filter((g) => g.vegetarian).length;
  const pct = (n) => (total ? Math.round((n * 100) / total) + "%" : "0%");

  // gộp theo bàn
  const map = new Map();
  for (const g of guests) {
    const t = String(g.table == null ? "" : g.table).trim() || "(chưa xếp bàn)";
    if (!map.has(t)) map.set(t, { total: 0, ci: 0, cf: 0, veg: 0 });
    const o = map.get(t);
    o.total++;
    if (g.checkedIn) o.ci++;
    if (g.confirmed) o.cf++;
    if (g.vegetarian) o.veg++;
  }
  const tables = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi", { numeric: true }));

  const cards = `<div class="dash-cards">
    ${statCard("Tổng khách", total, "")}
    ${statCard("Đã check-in", ci, pct(ci))}
    ${statCard("Đã xác nhận", cf, pct(cf))}
    ${statCard("Ăn chay", veg, "")}
  </div>`;
  const rows = tables
    .map(
      ([t, o]) =>
        `<tr><td>${esc(t)}</td><td>${o.total}</td><td>${o.ci}</td><td>${o.cf}</td><td>${o.veg}</td></tr>`
    )
    .join("");
  const tbl = `<div class="dash-tablewrap"><table class="dash-table">
    <thead><tr><th>Bàn</th><th>Khách</th><th>Check-in</th><th>Xác nhận</th><th>Ăn chay</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td>Tổng · ${tables.length} bàn</td><td>${total}</td><td>${ci}</td><td>${cf}</td><td>${veg}</td></tr></tfoot>
  </table></div>`;
  return `<div class="dashboard">${cards}<div class="dash-subhead">Số lượng khách theo bàn</div>${tbl}</div>`;
}

function viaLabel(v) {
  return v === "qr" ? "khách (QR)" : v ? esc(v) : "—";
}
// Log hoạt động: giờ + máy thao tác cho check-in / xác nhận / ăn chay
function activityLog(g) {
  const lines = [];
  if (g.checkedIn) lines.push(`✓ Check-in · ${fmtTime(g.checkinAt) || "—"}${g.checkinBy ? " · 🖥 " + esc(g.checkinBy) : ""}`);
  if (g.confirmed) lines.push(`✓ Xác nhận · ${fmtTime(g.confirmedAt) || "—"} · 🖥 ${viaLabel(g.confirmedVia)}`);
  if (g.vegetarian) lines.push(`🥗 Ăn chay · ${fmtTime(g.vegetarianAt) || "—"} · 🖥 ${viaLabel(g.vegetarianVia)}`);
  if (g.cancelled) lines.push(`✕ Xác nhận huỷ · ${fmtTime(g.cancelledAt) || "—"} · 🖥 ${viaLabel(g.cancelledVia)}`);
  return lines.length ? `<div class="activity">${lines.map((l) => `<div>${l}</div>`).join("")}</div>` : "";
}

function confirmBadge(g) {
  return g.confirmed
    ? `<span class="badge confirm-yes">✓ Đã xác nhận</span>`
    : `<span class="badge confirm-no">Chưa xác nhận</span>`;
}
function cancelBadge(g) {
  return g.cancelled ? `<span class="badge cancel-yes">✕ Đã huỷ</span>` : "";
}
// thuộc tính disabled nếu Admin đang khoá tính năng (chỉ áp dụng cho Operations)
const dis = (f) => (lockedFor(f) ? ' disabled title="Admin đang khoá tính năng này"' : "");

function confirmBtn(g) {
  return g.confirmed
    ? `<button class="btn-confirm on" data-unconfirm="${esc(g.id)}"${dis("confirm")}>Bỏ xác nhận</button>`
    : `<button class="btn-confirm" data-confirm="${esc(g.id)}"${dis("confirm")}>Xác nhận</button>`;
}
function vegBtn(g) {
  return g.vegetarian
    ? `<button class="btn-veg on" data-unveg="${esc(g.id)}"${dis("vegetarian")}>Bỏ ăn chay</button>`
    : `<button class="btn-veg" data-veg="${esc(g.id)}"${dis("vegetarian")}>Ăn chay</button>`;
}
// Nút "Xác nhận huỷ" — CHỈ admin mới thấy & thao tác (đánh dấu khách báo không tham gia)
function cancelBtn(g) {
  return g.cancelled
    ? `<button class="btn-cancel on" data-uncancel="${esc(g.id)}">Bỏ huỷ</button>`
    : `<button class="btn-cancel" data-cancel="${esc(g.id)}">Xác nhận huỷ</button>`;
}

function card(g) {
  const phone = g.phone ? esc(g.phone) : "—";
  const table = g.table ? `Bàn ${esc(g.table)}` : "Chưa xếp bàn";
  const ciBtn = g.checkedIn
    ? `<button class="btn-undo" data-undo="${esc(g.id)}"${dis("checkin")}>Hoàn tác</button>`
    : `<button class="btn-checkin" data-checkin="${esc(g.id)}"${dis("checkin")}>Check-in</button>`;
  const ciTag = g.checkedIn ? `<span class="badge ok">✓ Đã check-in</span> ` : "";
  const vegTag = g.vegetarian ? ` <span class="badge veg-yes">🥗 Ăn chay</span>` : "";
  const cancelTag = g.cancelled ? ` ${cancelBadge(g)}` : "";
  const sttTag = g.stt !== "" && g.stt != null ? `<span class="stt-tag">STT ${esc(g.stt)}</span> ` : "";
  const sub = [g.position, g.company].filter(Boolean).map(esc).join(" · ");
  // khách xác nhận huỷ -> thẻ highlight đỏ (ưu tiên hơn nền "đã check-in")
  const cardCls = g.cancelled ? " cancelled" : g.checkedIn ? " done" : "";
  // nút Xác nhận huỷ nằm DƯỚI nút Check-in, chỉ admin mới thấy
  const cancelAction = isAdmin ? cancelBtn(g) : "";
  return `<div class="card${cardCls}">
    <div class="card-main">
      <div class="name">${sttTag}${esc(g.name)} ${ciTag}${confirmBadge(g)}${vegTag}${cancelTag}</div>
      ${sub ? `<div class="sub">${sub}</div>` : ""}
      <div class="meta"><span>📞 ${phone}</span><span>🍽 ${table}</span></div>
      ${activityLog(g)}
    </div>
    ${isViewOnly ? "" : `<div class="card-actions">${confirmBtn(g)}${vegBtn(g)}${ciBtn}${cancelAction}</div>`}
  </div>`;
}

async function toggleCheckin(id, on) {
  if (isViewOnly) return flash("Tài khoản chỉ xem — không thể chỉnh sửa.", true);
  if (lockedFor("checkin")) return flash("Chức năng check-in đang bị Admin khoá.", true);
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

async function toggleVeg(id, on) {
  if (isViewOnly) return flash("Tài khoản chỉ xem — không thể chỉnh sửa.", true);
  if (lockedFor("vegetarian")) return flash("Chức năng ăn chay đang bị Admin khoá.", true);
  const g = guests.find((x) => x.id === id);
  try {
    await store.setVegetarian(id, on);
    if (g) flash(on ? `🥗 Đã đánh dấu ăn chay: ${g.name}` : `Đã bỏ ăn chay: ${g.name}`);
  } catch (e) {
    flash("Lỗi khi lưu, vui lòng thử lại.", true);
  }
}

async function toggleConfirm(id, on) {
  if (isViewOnly) return flash("Tài khoản chỉ xem — không thể chỉnh sửa.", true);
  if (lockedFor("confirm")) return flash("Chức năng xác nhận đang bị Admin khoá.", true);
  const g = guests.find((x) => x.id === id);
  try {
    await store.setConfirm(id, on);
    if (g) flash(on ? `✓ Đã xác nhận: ${g.name}` : `Đã bỏ xác nhận: ${g.name}`);
  } catch (e) {
    flash("Lỗi khi lưu, vui lòng thử lại.", true);
  }
}

// Xác nhận huỷ (khách báo KHÔNG tham gia) — CHỈ admin được thao tác
async function toggleCancel(id, on) {
  if (!isAdmin) return flash("Chỉ tài khoản admin mới được xác nhận huỷ.", true);
  const g = guests.find((x) => x.id === id);
  if (on && !confirm(`Đánh dấu khách "${g ? g.name : ""}" XÁC NHẬN HUỶ (không tham gia)?`)) return;
  try {
    await store.setCancel(id, on);
    if (g) flash(on ? `✕ Đã đánh dấu huỷ (không tham gia): ${g.name}` : `Đã bỏ đánh dấu huỷ: ${g.name}`);
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

// ========================================================
//  EXPORT / IMPORT (backup & khôi phục trạng thái)
// ========================================================
const toISO = (t) => {
  if (!t) return "";
  const d = t.toDate ? t.toDate() : new Date(t);
  return isNaN(d) ? "" : d.toISOString();
};

function exportBackup() {
  const cols = ["STT", "Tên khách", "Đơn vị", "SĐT", "Số bàn", "Đã check-in", "Giờ check-in", "Quầy", "Đã xác nhận", "Ăn chay", "Xác nhận huỷ", "_checkinAtISO", "_confirmedAtISO"];
  const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  const list = guests.slice().sort((a, b) => (Number(a.stt) || 0) - (Number(b.stt) || 0));
  const lines = [cols.join(",")];
  for (const g of list) {
    lines.push(
      [g.stt || "", g.name || "", g.company || "", g.phone || "", g.table || "",
       g.checkedIn ? "Có" : "Không", g.checkedIn ? fmtTime(g.checkinAt) : "", g.checkedIn ? g.checkinBy || "" : "",
       g.confirmed ? "Có" : "Không", g.vegetarian ? "Có" : "Không", g.cancelled ? "Có" : "Không", toISO(g.checkinAt), toISO(g.confirmedAt)].map(q).join(",")
    );
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.href = URL.createObjectURL(blob);
  a.download = `backup-checkin-${ts}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  flash(`✓ Đã tải backup ${list.length} khách.`);
}

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function importBackup(file) {
  if (isViewOnly) return flash("Tài khoản chỉ xem — không thể chỉnh sửa.", true);
  let rows;
  try { rows = parseCSV(await file.text()); } catch (_) { return flash("Không đọc được file.", true); }
  if (rows.length < 2) return flash("File rỗng hoặc sai định dạng.", true);
  const h = rows[0].map((x) => x.trim());
  const I = (name) => h.indexOf(name);
  const iStt = I("STT"), iChk = I("Đã check-in"), iCfm = I("Đã xác nhận"), iVeg = I("Ăn chay"), iCxl = I("Xác nhận huỷ");
  const iBy = I("Quầy"), iChkAt = I("_checkinAtISO"), iCfmAt = I("_confirmedAtISO");
  if (iStt < 0 || iChk < 0 || iCfm < 0) return flash("File không đúng định dạng backup (thiếu cột).", true);

  const cur = new Map(guests.map((g) => [String(g.stt), g]));
  const updates = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[iStt]) continue;
    const g = cur.get(String(row[iStt]).trim());
    if (!g) continue; // bỏ STT không có trong danh sách hiện tại
    const checkedIn = (row[iChk] || "").trim() === "Có";
    const confirmed = (row[iCfm] || "").trim() === "Có";
    const vegetarian = iVeg >= 0 ? (row[iVeg] || "").trim() === "Có" : !!g.vegetarian;
    const cancelled = iCxl >= 0 ? (row[iCxl] || "").trim() === "Có" : !!g.cancelled;
    if (!!g.checkedIn === checkedIn && !!g.confirmed === confirmed && !!g.vegetarian === vegetarian && !!g.cancelled === cancelled) continue; // không đổi -> bỏ
    const chkISO = iChkAt >= 0 ? (row[iChkAt] || "").trim() : "";
    const cfmISO = iCfmAt >= 0 ? (row[iCfmAt] || "").trim() : "";
    updates.push({
      id: g.id,
      data: {
        checkedIn,
        checkinAt: checkedIn ? (chkISO ? new Date(chkISO) : new Date()) : null,
        checkinBy: checkedIn ? (iBy >= 0 ? (row[iBy] || "").trim() : "") || station || "backup" : null,
        confirmed,
        confirmedAt: confirmed ? (cfmISO ? new Date(cfmISO) : new Date()) : null,
        confirmedVia: confirmed ? "restore" : null,
        vegetarian,
        vegetarianAt: vegetarian ? new Date() : null,
        vegetarianVia: vegetarian ? "restore" : null,
        cancelled,
        cancelledAt: cancelled ? new Date() : null,
        cancelledVia: cancelled ? "restore" : null,
      },
    });
  }
  if (!updates.length) return flash("Không có gì cần khôi phục (trạng thái đã trùng).");
  if (!confirm(`Khôi phục trạng thái check-in/xác nhận cho ${updates.length} khách từ file backup?`)) return;
  flash(`Đang khôi phục ${updates.length} khách…`);
  let ok = 0;
  for (const u of updates) {
    try { await store.restore(u.id, u.data); ok++; } catch (_) {}
  }
  flash(`✓ Đã khôi phục ${ok}/${updates.length} khách.`, ok < updates.length);
}

init();
