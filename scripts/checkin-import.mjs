// =====================================================================
//  checkin-import.mjs — Nạp danh sách khách (có SĐT) lên Firebase Firestore
// =====================================================================
//  • Đọc data/checkin.xlsx -> collection "guests" trên Firestore.
//  • Doc ID = STT (ổn định). Chạy lại để cập nhật thông tin khách
//    mà KHÔNG xoá trạng thái đã check-in.
//  Cần: private/serviceAccount.json (tải từ Firebase Console).
//  Xem hướng dẫn ở CHECKIN-SETUP.md.
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import admin from "firebase-admin";
import { config } from "../config.mjs";
import { backupCollection } from "./checkin-backup.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);
const cfg = config.checkin;

function fail(m) {
  console.error("\n❌ " + m + "\n");
  process.exit(1);
}

const saPath = p(cfg.serviceAccount);
if (!fs.existsSync(saPath))
  fail(`Thiếu service account: ${cfg.serviceAccount}\n   → Tải từ Firebase Console (xem CHECKIN-SETUP.md).`);
if (!fs.existsSync(p(cfg.inputFile)))
  fail(`Thiếu file dữ liệu: ${cfg.inputFile} (cần có cột SĐT).`);

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, "utf8"))) });
const db = admin.firestore();

// --- Đọc Excel ---
const wb = XLSX.readFile(p(cfg.inputFile));
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: config.headerRow || 0 });
const headers = Object.keys(rows[0] || {});
const C = cfg.columns;
for (const key of ["stt", "name"]) {
  if (!headers.includes(C[key])) fail(`Không thấy cột "${C[key]}" (cho "${key}"). Cột có: ${headers.join(", ")}`);
}
if (!headers.includes(C.phone)) console.log(`⚠️ Không thấy cột SĐT "${C.phone}" — sẽ để trống (không tìm được theo SĐT).`);

const norm = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ").trim();
const get = (row, col) => (col && headers.includes(col) ? String(row[col] ?? "").replace(/\s+/g, " ").trim() : "");

console.log(`\n📄 Đọc ${rows.length} khách từ ${cfg.inputFile}.`);

// OVERWRITE=1 -> GHI ĐÈ: xoá sạch collection rồi nạp lại (reset check-in/xác nhận/ăn chay).
// Mặc định (không cờ) -> MERGE: giữ nguyên trạng thái cũ, chỉ cập nhật thông tin khách.
const OVERWRITE = /^(1|true|yes)$/i.test(process.env.OVERWRITE || "");

let existing = new Map();
if (OVERWRITE) {
  // 🛡️ AN TOÀN: luôn sao lưu collection RA FILE trước khi xoá bất cứ thứ gì.
  const { file, count } = await backupCollection(db, cfg.collection, "pre-overwrite");
  console.log(`\n🛡️  Đã sao lưu ${count} doc trước khi GHI ĐÈ → ${path.relative(root, file)}`);

  // 🛡️ AN TOÀN: bắt buộc gõ xác nhận (trừ khi FORCE=1, dùng cho tự động hoá).
  const FORCE = /^(1|true|yes)$/i.test(process.env.FORCE || "");
  if (!FORCE) {
    console.log(`\n⚠️  GHI ĐÈ sẽ XOÁ SẠCH collection "${cfg.collection}" và RESET mọi trạng thái`);
    console.log(`   check-in / xác nhận / ăn chay. Dữ liệu sống thu tại sự kiện sẽ MẤT.`);
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question(`\n   Gõ đúng tên collection "${cfg.collection}" để xác nhận xoá: `);
    rl.close();
    if (ans.trim() !== cfg.collection) {
      console.log(`\n❌ Đã HUỶ (không khớp). Không có gì bị xoá. Backup vẫn ở: ${path.relative(root, file)}\n`);
      process.exit(1);
    }
  }

  let cleared = 0;
  while (true) {
    const s = await db.collection(cfg.collection).limit(400).get();
    if (s.empty) break;
    const b = db.batch();
    s.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
    cleared += s.size;
  }
  console.log(`   ⚠️ GHI ĐÈ: đã xoá ${cleared} doc cũ (reset check-in/xác nhận/ăn chay).`);
} else {
  // --- Giữ trạng thái check-in cũ ---
  const snap = await db.collection(cfg.collection).get();
  snap.forEach((d) => existing.set(d.id, d.data()));
  console.log(`   Trên Firestore đang có ${existing.size} khách.`);
}

// --- Ghi theo lô ---
let batch = db.batch();
let n = 0,
  pending = 0;
for (const row of rows) {
  const stt = get(row, C.stt);
  const nm = get(row, C.name);
  if (!stt && !nm) continue; // bỏ dòng rỗng hẳn
  // Khách không có STT (vd khách bổ sung cuối): khóa theo tên (chỉ hiện tên)
  const id = stt ? String(stt) : "x-" + norm(nm).replace(/\s+/g, "-").slice(0, 40);
  const prev = existing.get(id) || {};
  const data = {
    stt: stt ? Number(stt) || stt : "",
    name: get(row, C.name),
    position: get(row, C.position),
    company: get(row, C.company),
    phone: get(row, C.phone),
    table: get(row, C.table),
    search: norm(`${get(row, C.name)} ${get(row, C.company)}`),
    // giữ nguyên trạng thái check-in nếu đã có
    checkedIn: prev.checkedIn ?? false,
    checkinAt: prev.checkinAt ?? null,
    checkinBy: prev.checkinBy ?? null,
  };
  batch.set(db.collection(cfg.collection).doc(id), data, OVERWRITE ? {} : { merge: true });
  n++;
  if (++pending >= 400) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
    console.log(`   ...đã ghi ${n}`);
  }
}
if (pending) await batch.commit();

console.log(`\n✅ Đã ${OVERWRITE ? "GHI ĐÈ" : "nạp"} ${n} khách lên Firestore collection "${cfg.collection}".`);
if (OVERWRITE) {
  console.log(`   (Trạng thái check-in/xác nhận/ăn chay đã reset.)\n`);
} else {
  const done = [...existing.values()].filter((d) => d.checkedIn).length;
  console.log(`   (Giữ nguyên ${done} khách đã check-in trước đó.)\n`);
}
process.exit(0);
