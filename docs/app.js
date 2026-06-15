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
    `);
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
