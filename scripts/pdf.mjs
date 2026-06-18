// =====================================================================
//  pdf.mjs — Gộp các ảnh QR (đã in tên) thành 1 file PDF A4 sẵn sàng in
// =====================================================================
//  Đọc private/guests.index.json + ảnh trong private/qr/ -> private/qr-print.pdf
//  Mỗi trang xếp lưới cardsPerRow × cardsPerCol, có đường cắt mờ.
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);

const indexPath = p("private", "guests.index.json");
if (!fs.existsSync(indexPath)) {
  console.error("\n❌ Chưa có private/guests.index.json — chạy `npm run import` rồi `npm run qr` trước.\n");
  process.exit(1);
}
const guests = JSON.parse(fs.readFileSync(indexPath, "utf8"));

const safeName = (s) =>
  String(s || "khach").replace(/[\/\\:*?"<>|]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

// đường dẫn ảnh QR theo đúng quy ước đặt tên ở qrcodes.mjs ("STT - Tên.png")
const files = guests.map((g) => p("private", "qr", `${String(g.stt || "").padStart(3, "0")} - ${safeName(g.name)}.png`));
const missing = files.filter((f) => !fs.existsSync(f));
if (missing.length) {
  console.error(`\n❌ Thiếu ${missing.length} ảnh QR (chạy \`npm run qr\` trước). Ví dụ: ${path.basename(missing[0])}\n`);
  process.exit(1);
}

const cols = config.qr.cardsPerRow;
const rows = config.qr.cardsPerCol;
const perPage = cols * rows;

const doc = new PDFDocument({ size: "A4", margin: 28, autoFirstPage: false });
const outPath = p("private", "qr-print.pdf");
doc.pipe(fs.createWriteStream(outPath));

const PAGE_W = 595.28,
  PAGE_H = 841.89,
  M = 28;
const gridW = PAGE_W - 2 * M;
const gridH = PAGE_H - 2 * M - 14; // chừa 14pt cho footer
const cellW = gridW / cols;
const cellH = gridH / rows;
const totalPages = Math.ceil(files.length / perPage);

files.forEach((file, idx) => {
  const slot = idx % perPage;
  if (slot === 0) doc.addPage();
  const r = Math.floor(slot / cols);
  const c = slot % cols;
  const x = M + c * cellW;
  const y = M + r * cellH;

  // đường cắt mờ
  doc.save().lineWidth(0.5).dash(3, { space: 3 }).strokeColor("#cccccc").rect(x, y, cellW, cellH).stroke().undash().restore();

  // ảnh QR fit trong ô, giữ tỉ lệ, căn giữa
  const pad = 10;
  doc.image(file, x + pad, y + pad, {
    fit: [cellW - 2 * pad, cellH - 2 * pad],
    align: "center",
    valign: "center",
  });

  // footer cuối mỗi trang
  const isPageEnd = slot === perPage - 1 || idx === files.length - 1;
  if (isPageEnd) {
    const pg = Math.floor(idx / perPage) + 1;
    doc
      .fontSize(8)
      .fillColor("#999999")
      .text(`${config.eventName} — trang ${pg}/${totalPages}`, M, PAGE_H - M - 6, {
        width: gridW,
        align: "center",
      });
  }
});

doc.end();
doc.on("end", () => {});
await new Promise((res) => doc.on("finish", res).on("end", res));

console.log(`\n✅ Đã tạo file in: private/qr-print.pdf`);
console.log(`   ${files.length} QR · ${cols}×${rows}/trang · ${totalPages} trang A4.`);
console.log(`   → Mở file, in trực tiếp (in 100%, không "fit to page"), rồi cắt theo đường mờ.\n`);
