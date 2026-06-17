// Đọc token từ URL (#token) -> tải g/<token>.json -> hiển thị thông tin bàn.
(function () {
  "use strict";

  const card = document.getElementById("card");
  const footer = document.getElementById("footer");

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function getToken() {
    // hỗ trợ cả "#token" và "#/token"
    return decodeURIComponent(location.hash.replace(/^#\/?/, "").trim());
  }

  function show(html) {
    card.innerHTML = html;
  }

  function showMessage(title, sub) {
    show(
      `<div class="state"><div class="msg-title">${esc(title)}</div>${
        sub ? `<div class="msg-sub">${esc(sub)}</div>` : ""
      }</div>`
    );
  }

  function renderGuest(cfg, g) {
    const hasTable = g.table != null && String(g.table).trim() !== "";
    const tableBox = hasTable
      ? `<div class="table-box">
           <div class="table-label">BÀN SỐ</div>
           <div class="table-num">${esc(g.table)}</div>
         </div>`
      : `<div class="table-box pending">
           <div class="table-label">SỐ BÀN</div>
           <div class="pending-text">Đang cập nhật</div>
           <div class="pending-sub">Quý khách vui lòng quét lại gần giờ sự kiện</div>
         </div>`;
    show(`
      <div class="event">${esc(cfg.eventName || "")}</div>
      <div class="subtitle">${esc(cfg.eventSubtitle || "")}</div>
      <div class="greeting">Kính chào</div>
      <h1 class="name">${g.title ? `<span class="honorific">${esc(g.title)}</span> ` : ""}${esc(g.name || "Quý khách")}</h1>
      ${g.company ? `<div class="company">${esc(g.company)}</div>` : ""}
      ${g.stt ? `<div class="stt-line"><span>STT</span><b>${esc(g.stt)}</b></div>` : ""}
      ${tableBox}
      <div class="confirm-area" id="confirmArea"></div>
      <div class="veg-area" id="vegArea"></div>
    `);
    setupConfirm(g, cfg);
    setupVeg(g);
  }

  // ----- Firebase: đọc thông tin khách (event_public) + ghi xác nhận (event_guests) -----
  const SDK = "https://www.gstatic.com/firebasejs/10.12.0";
  const PUBLIC_COL = "event_public";
  let _fb; // undefined = chưa nạp; null = chưa cấu hình Firebase
  async function loadFb() {
    if (_fb !== undefined) return _fb;
    const { firebaseConfig, collectionName } = await import("./checkin/config.js?v=2");
    if (!firebaseConfig || !firebaseConfig.apiKey) return (_fb = null);
    const { initializeApp } = await import(`${SDK}/firebase-app.js`);
    const { getFirestore, doc, getDoc, setDoc, serverTimestamp } = await import(`${SDK}/firebase-firestore.js`);
    const app = initializeApp(firebaseConfig, "guest");
    _fb = { db: getFirestore(app), doc, getDoc, setDoc, serverTimestamp, collectionName };
    return _fb;
  }

  // Đọc 1 document theo token (không cần đăng nhập — rules cho phép get, cấm list)
  async function fetchGuest(token) {
    const fb = await loadFb();
    if (!fb) return undefined; // chưa cấu hình -> để main() báo lỗi cấu hình
    const snap = await fb.getDoc(fb.doc(fb.db, PUBLIC_COL, token));
    return snap.exists() ? snap.data() : null; // null = không tìm thấy token
  }

  async function remoteConfirm(stt, on) {
    if (!stt) throw new Error("no-stt");
    const fb = await loadFb();
    if (!fb) throw new Error("not-configured");
    await fb.setDoc(
      fb.doc(fb.db, fb.collectionName, String(stt)),
      { confirmed: on, confirmedAt: on ? fb.serverTimestamp() : null, confirmedVia: "qr" },
      { merge: true }
    );
  }

  async function remoteVeg(stt, on) {
    if (!stt) throw new Error("no-stt");
    const fb = await loadFb();
    if (!fb) throw new Error("not-configured");
    await fb.setDoc(
      fb.doc(fb.db, fb.collectionName, String(stt)),
      { vegetarian: on, vegetarianAt: on ? fb.serverTimestamp() : null, vegetarianVia: "qr" },
      { merge: true }
    );
  }

  function setupVeg(g) {
    const area = document.getElementById("vegArea");
    if (!area) return;
    const key = "vt.veg." + getToken();
    let veg = localStorage.getItem(key) === "1";

    async function setVeg(on) {
      const btn = area.querySelector("button");
      if (btn) btn.disabled = true;
      try {
        await remoteVeg(g.stt, on);
      } catch (e) {
        paint();
        area.insertAdjacentHTML("beforeend", `<div class="confirm-err">Chưa lưu được, vui lòng thử lại.</div>`);
        return;
      }
      veg = on;
      localStorage.setItem(key, on ? "1" : "0");
      paint();
    }
    function paint() {
      area.innerHTML = `<button type="button" class="veg-btn${veg ? " on" : ""}">${veg ? "✓ Ăn chay" : "🥗 Tôi ăn chay"}</button>`;
      area.querySelector(".veg-btn").onclick = () => setVeg(!veg);
    }
    paint();
  }

  function fmtDeadline(ms) {
    try {
      const parts = new Intl.DateTimeFormat("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }).formatToParts(ms);
      const g = (t) => (parts.find((x) => x.type === t) || {}).value || "";
      return `${g("hour")}:${g("minute")} ${g("day")}/${g("month")}/${g("year")}`;
    } catch (_) {
      return "";
    }
  }

  function setupConfirm(g, cfg) {
    const area = document.getElementById("confirmArea");
    if (!area) return;
    const key = "vt.confirmed." + getToken();
    let confirmed = localStorage.getItem(key) === "1";

    const deadline = cfg && cfg.confirmDeadline ? Date.parse(cfg.confirmDeadline) : NaN;
    const closed = !isNaN(deadline) && Date.now() > deadline;

    async function setConfirm(on) {
      if (closed) return; // hết hạn -> khoá thao tác
      const btn = area.querySelector("button");
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Đang lưu…";
      }
      try {
        await remoteConfirm(g.stt, on); // ghi Firestore trước
      } catch (e) {
        paint(); // khôi phục nút
        area.insertAdjacentHTML(
          "beforeend",
          `<div class="confirm-err">Chưa lưu được. Vui lòng kiểm tra mạng và thử lại, hoặc liên hệ lễ tân.</div>`
        );
        return;
      }
      confirmed = on; // chỉ đổi trạng thái khi đã lưu thành công
      localStorage.setItem(key, on ? "1" : "0");
      paint();
    }
    function paint() {
      if (confirmed) {
        area.innerHTML =
          `<div class="confirm-done">✓ Đã xác nhận tham dự</div>` +
          (closed ? "" : `<button type="button" class="confirm-cancel">Hủy xác nhận</button>`);
        const c = area.querySelector(".confirm-cancel");
        if (c) c.onclick = () => setConfirm(false);
      } else if (closed) {
        area.innerHTML =
          `<div class="confirm-closed">Đã hết hạn xác nhận tham dự` +
          (!isNaN(deadline) ? `<small>Hạn chót: ${fmtDeadline(deadline)}</small>` : "") +
          `</div>`;
      } else {
        area.innerHTML = `<button type="button" class="confirm-btn">Xác nhận tham dự</button>`;
        area.querySelector(".confirm-btn").onclick = () => setConfirm(true);
      }
    }
    paint();
  }

  async function main() {
    let cfg = {};
    try {
      cfg = await fetch("./config.json", { cache: "no-cache" }).then((r) => r.json());
    } catch (_) {}
    footer.textContent = cfg.footerNote || "";

    const token = getToken();
    if (!token) {
      showMessage("Vui lòng quét mã QR", "Quét mã QR trên thiệp mời để xem thông tin bàn tiệc của bạn.");
      return;
    }

    // chỉ cho phép ký tự token hợp lệ (chống path traversal)
    if (!/^[A-Za-z0-9]+$/.test(token)) {
      showMessage("Mã không hợp lệ", "Vui lòng kiểm tra lại mã QR.");
      return;
    }

    try {
      const g = await fetchGuest(token);
      if (g === undefined) {
        showMessage("Chưa sẵn sàng", "Hệ thống đang được cấu hình. Vui lòng thử lại sau hoặc liên hệ lễ tân.");
        return;
      }
      if (!g) throw new Error("not found");
      renderGuest(cfg, g);
      document.title = (g.name ? g.name + " — " : "") + (cfg.eventName || "Thông tin bàn tiệc");
    } catch (e) {
      showMessage("Không tìm thấy thông tin", "Mã QR có thể không đúng. Vui lòng liên hệ lễ tân để được hỗ trợ.");
    }
  }

  window.addEventListener("hashchange", main);
  main();
})();
