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
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import admin from "firebase-admin";
import { config } from "../config.mjs";

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

// --- Giữ trạng thái check-in cũ ---
const snap = await db.collection(cfg.collection).get();
const existing = new Map();
snap.forEach((d) => existing.set(d.id, d.data()));
console.log(`   Trên Firestore đang có ${existing.size} khách.`);

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
    company: get(row, C.company),
    phone: get(row, C.phone),
    table: get(row, C.table),
    search: norm(`${get(row, C.name)} ${get(row, C.company)}`),
    // giữ nguyên trạng thái check-in nếu đã có
    checkedIn: prev.checkedIn ?? false,
    checkinAt: prev.checkinAt ?? null,
    checkinBy: prev.checkinBy ?? null,
  };
  batch.set(db.collection(cfg.collection).doc(id), data, { merge: true });
  n++;
  if (++pending >= 400) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
    console.log(`   ...đã ghi ${n}`);
  }
}
if (pending) await batch.commit();

const done = [...existing.values()].filter((d) => d.checkedIn).length;
console.log(`\n✅ Đã nạp ${n} khách lên Firestore collection "${cfg.collection}".`);
console.log(`   (Giữ nguyên ${done} khách đã check-in trước đó.)\n`);
process.exit(0);
