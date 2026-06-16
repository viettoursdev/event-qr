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
      <h1 class="name">${esc(g.name || "Quý khách")}</h1>
      ${g.company ? `<div class="company">${esc(g.company)}</div>` : ""}
      ${g.stt ? `<div class="stt-line"><span>STT</span><b>${esc(g.stt)}</b></div>` : ""}
      ${tableBox}
      <div class="confirm-area" id="confirmArea"></div>
    `);
    setupConfirm(g, cfg);
  }

  // ----- Xác nhận tham dự (RSVP) -----
  let _fb;
  async function remoteConfirm(stt, on) {
    if (!stt) return;
    const SDK = "https://www.gstatic.com/firebasejs/10.12.0";
    const { firebaseConfig, collectionName } = await import("./checkin/config.js");
    if (!firebaseConfig || !firebaseConfig.apiKey) return; // DEMO: chỉ lưu cục bộ
    if (!_fb) {
      const { initializeApp } = await import(`${SDK}/firebase-app.js`);
      const { getAuth, signInAnonymously } = await import(`${SDK}/firebase-auth.js`);
      const { getFirestore, doc, setDoc, serverTimestamp } = await import(`${SDK}/firebase-firestore.js`);
      const app = initializeApp(firebaseConfig, "guest");
      await signInAnonymously(getAuth(app));
      _fb = { db: getFirestore(app), doc, setDoc, serverTimestamp };
    }
    await _fb.setDoc(
      _fb.doc(_fb.db, collectionName, String(stt)),
      { confirmed: on, confirmedAt: on ? _fb.serverTimestamp() : null, confirmedVia: "qr" },
      { merge: true }
    );
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
      confirmed = on;
      localStorage.setItem(key, on ? "1" : "0");
      paint();
      try {
        await remoteConfirm(g.stt, on);
      } catch (_) {
        /* đã lưu cục bộ; bỏ qua lỗi mạng */
      }
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
      const res = await fetch(`./g/${token}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error("not found");
      const g = await res.json();
      renderGuest(cfg, g);
      document.title = (g.name ? g.name + " — " : "") + (cfg.eventName || "Thông tin bàn tiệc");
    } catch (e) {
      showMessage("Không tìm thấy thông tin", "Mã QR có thể không đúng. Vui lòng liên hệ lễ tân để được hỗ trợ.");
    }
  }

  window.addEventListener("hashchange", main);
  main();
})();
