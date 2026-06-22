// =====================================================================
//  public-import.mjs — Đẩy dữ liệu HIỂN THỊ của khách lên Firestore
//  collection "event_public" (khóa theo TOKEN), để trang QR đọc.
//  Chỉ gồm: name, company, stt, table — KHÔNG có SĐT.
//  Rules: cho phép GET 1 doc theo token, CẤM list (không liệt kê được).
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);
const COL = "event_public";

const saPath = p(config.checkin.serviceAccount);
if (!fs.existsSync(saPath)) {
  console.error(`\n❌ Không thấy ${config.checkin.serviceAccount}. Tải service account về trước.\n`);
  process.exit(1);
}
const indexPath = p("private", "guests.index.json");
if (!fs.existsSync(indexPath)) {
  console.error("\n❌ Chưa có private/guests.index.json — chạy `npm run import` trước.\n");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, "utf8"))) });
const db = admin.firestore();
const guests = JSON.parse(fs.readFileSync(indexPath, "utf8"));

// 1) Xoá sạch dữ liệu công khai cũ (giữ đồng bộ với danh sách hiện tại)
let cleared = 0;
while (true) {
  const s = await db.collection(COL).limit(450).get();
  if (s.empty) break;
  const b = db.batch();
  s.docs.forEach((d) => b.delete(d.ref));
  await b.commit();
  cleared += s.size;
}

// 2) Ghi dữ liệu hiển thị mới (doc id = token)
let n = 0,
  c = 0;
let batch = db.batch();
for (const g of guests) {
  const data = { name: g.nameDisplay || g.name || "", table: g.table || "" };
  if (g.title) data.title = g.title;
  if (g.position) data.position = g.positionDisplay || g.position;
  if (g.company) data.company = g.companyDisplay || g.company;
  if (g.stt) data.stt = g.stt;
  batch.set(db.collection(COL).doc(g.token), data);
  if (++c >= 450) {
    await batch.commit();
    batch = db.batch();
    c = 0;
  }
  n++;
}
if (c) await batch.commit();

console.log(`\n✅ event_public: xoá ${cleared} cũ, ghi ${n} khách (tên/công ty/STT/bàn — KHÔNG SĐT).`);
process.exit(0);
