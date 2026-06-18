// =====================================================================
//  qrcodes.mjs — Sinh ảnh QR (kèm TÊN KHÁCH in trên ảnh) + trang in
// =====================================================================
//  Đọc private/guests.index.json -> tạo:
//   - private/qr/<STT>_<Tên>_<token>.png : ảnh QR có in tên + công ty
//   - private/print.html                 : trang in tất cả thẻ (-> Lưu PDF)
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import sharp from "sharp";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);

const indexPath = p("private", "guests.index.json");
if (!fs.existsSync(indexPath)) {
  console.error("\n❌ Chưa có private/guests.index.json — hãy chạy `npm run import` trước.\n");
  process.exit(1);
}
if (config.baseUrl.includes("USERNAME")) {
  console.error(
    "\n❌ config.baseUrl vẫn còn 'USERNAME'.\n" +
      "   → Sửa baseUrl trong config.mjs thành URL GitHub Pages thật,\n" +
      "     rồi chạy lại `npm run import` và `npm run qr`.\n" +
      "   (QR mã hóa URL này — sai URL thì khách quét sẽ không mở được.)\n"
  );
  process.exit(1);
}

const guests = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const qrDir = p("private", "qr");
fs.rmSync(qrDir, { recursive: true, force: true });
fs.mkdirSync(qrDir, { recursive: true });

const { pngSize, margin, darkColor, lightColor, nameOnImage } = config.qr;

const xmlEsc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

// Tên file an toàn (bỏ ký tự không hợp lệ, giữ dấu tiếng Việt)
const safeName = (s) =>
  String(s || "khach")
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

// Tên file theo format "STT - Tên khách mời" (STT đệm 0 để sắp xếp đúng)
const qrFileName = (g) => `${String(g.stt || "").padStart(3, "0")} - ${safeName(g.name)}.png`;

// Tạo 1 ảnh card: QR ở trên, nhãn "STT - Tên khách mời" in bên dưới
async function makeCard(url, name, stt) {
  const label = stt ? `${stt} - ${name}` : name;
  const qrBuf = await QRCode.toBuffer(url, {
    width: pngSize,
    margin,
    color: { dark: darkColor, light: lightColor },
    errorCorrectionLevel: "M",
    type: "png",
  });

  if (!nameOnImage) {
    return qrBuf; // chỉ QR thuần
  }

  const W = pngSize;
  const padTop = 28;
  const padX = 24;
  const maxTextW = W - 2 * padX;

  // Tự co chữ cho vừa bề ngang: giảm cỡ chữ trước, nếu vẫn dài thì nén khoảng cách.
  function fitText(text, maxFont, minFont) {
    const factor = 0.56; // bề rộng trung bình mỗi ký tự ≈ factor * fontSize
    let fontSize = maxFont;
    while (fontSize > minFont && text.length * fontSize * factor > maxTextW) fontSize -= 1;
    const estW = text.length * fontSize * factor;
    const textLen = estW > maxTextW ? ` textLength="${maxTextW}" lengthAdjust="spacingAndGlyphs"` : "";
    return { fontSize, textLen };
  }

  const labelFit = fitText(label, 38, 18);
  const labelH = 86;
  const H = padTop + pngSize + labelH;

  const labelSvg = `<svg width="${W}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
    <text x="50%" y="52" text-anchor="middle"${labelFit.textLen}
      font-family="Helvetica, Arial, sans-serif" font-size="${labelFit.fontSize}" font-weight="700" fill="#111111">${xmlEsc(label)}</text>
  </svg>`;

  return sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
    .composite([
      { input: qrBuf, top: padTop, left: 0 },
      { input: Buffer.from(labelSvg), top: padTop + pngSize, left: 0 },
    ])
    .png()
    .toBuffer();
}

console.log(`\n🔧 Sinh ${guests.length} mã QR${nameOnImage ? " (có in tên)" : ""}...`);
let n = 0;
for (const g of guests) {
  const buf = await makeCard(g.url, g.name, g.stt);
  n++;
  fs.writeFileSync(p("private", "qr", qrFileName(g)), buf);
  if (n % 50 === 0) console.log(`   ...${n}/${guests.length}`);
}
console.log(`   ✅ ${n} file PNG trong private/qr/`);

// --- Trang in (xem nhanh / in hàng loạt) ---
const htmlEsc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const { cardsPerRow, cardsPerCol } = config.qr;
const cards = guests
  .map((g) => {
    const file = qrFileName(g);
    return `    <div class="card">
      <img src="qr/${encodeURIComponent(file)}" alt="QR ${htmlEsc(g.name)}"/>
      <div class="meta">
        <div class="name">${g.stt ? htmlEsc(g.stt) + " - " : ""}${htmlEsc(g.name)}</div>
      </div>
    </div>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8"/>
<title>In QR — ${htmlEsc(config.eventName)}</title>
<style>
  :root { --rows:${cardsPerCol}; --cols:${cardsPerRow}; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#111; }
  .sheet { display:grid; grid-template-columns:repeat(var(--cols),1fr); }
  .card { display:flex; flex-direction:column; align-items:center; justify-content:flex-start;
          text-align:center; padding:6mm 4mm; border:1px dashed #ccc; page-break-inside:avoid; }
  .card img { width:54mm; height:auto; }
  .meta { margin-top:1mm; }
  .name { font-weight:700; font-size:12pt; }
  .company { font-size:10pt; color:#555; }
  .toolbar { padding:12px 16px; background:#f4f4f5; border-bottom:1px solid #ddd; position:sticky; top:0; font-size:14px; }
  @page { size:A4; margin:8mm; }
  @media print { .toolbar { display:none; } }
</style></head><body>
  <div class="toolbar">📄 ${guests.length} thẻ QR — nhấn <b>Ctrl/⌘ + P</b> để in / lưu PDF. Bố cục: ${cardsPerRow}×${cardsPerCol} thẻ/trang.</div>
  <div class="sheet">
${cards}
  </div>
</body></html>`;
fs.writeFileSync(p("private", "print.html"), html);
console.log(`   ✅ private/print.html — mở bằng trình duyệt rồi In/Lưu PDF.`);
console.log(`\n🎉 Xong! QR trỏ tới: ${config.baseUrl.replace(/\/?$/, "/")}#<token>\n`);
