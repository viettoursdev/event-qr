// =====================================================================
//  checkin-restore.mjs — Khôi phục collection check-in từ file backup JSON
// =====================================================================
//  • Đọc 1 file backup do checkin-backup.mjs tạo ra và GHI LẠI lên Firestore.
//  • MẶC ĐỊNH: merge (không xoá doc nào; chỉ ghi đè theo id có trong backup).
//    → an toàn để "đắp lại" dữ liệu vừa lỡ tay xoá.
//  • Cần gõ xác nhận trước khi ghi.
//
//  Dùng:
//    npm run checkin:restore -- private/backups/event_guests-....json
//
//  Cần: private/serviceAccount.json (tải từ Firebase Console).
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);
const cfg = config.checkin;

function fail(m) {
  console.error("\n❌ " + m + "\n");
  process.exit(1);
}

const arg = process.argv[2];
if (!arg) fail("Thiếu đường dẫn file backup.\n   Dùng: npm run checkin:restore -- private/backups/<file>.json");
const backupPath = path.isAbsolute(arg) ? arg : p(arg);
if (!fs.existsSync(backupPath)) fail(`Không thấy file backup: ${arg}`);

const saPath = p(cfg.serviceAccount);
if (!fs.existsSync(saPath)) fail(`Thiếu service account: ${cfg.serviceAccount} (xem CHECKIN-SETUP.md).`);

const payload = JSON.parse(fs.readFileSync(backupPath, "utf8"));
const docs = Array.isArray(payload.docs) ? payload.docs : [];
if (!docs.length) fail("File backup không có doc nào.");
const collection = payload.collection || cfg.collection;

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, "utf8"))) });
const db = admin.firestore();

console.log(`\n♻️  Sắp khôi phục ${docs.length} doc vào collection "${collection}"`);
console.log(`   từ backup: ${path.relative(root, backupPath)} (chụp lúc ${payload.backedUpAt || "?"})`);
console.log(`   Chế độ MERGE: chỉ ghi đè doc trùng id, KHÔNG xoá doc khác.`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ans = await rl.question(`\n   Gõ "yes" để tiếp tục: `);
rl.close();
if (ans.trim().toLowerCase() !== "yes") fail("Đã huỷ. Không ghi gì.");

let batch = db.batch();
let n = 0, pending = 0;
for (const { id, data } of docs) {
  if (!id) continue;
  batch.set(db.collection(collection).doc(String(id)), data, { merge: true });
  n++;
  if (++pending >= 400) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
    console.log(`   ...đã ghi ${n}`);
  }
}
if (pending) await batch.commit();

console.log(`\n✅ Đã khôi phục ${n} doc vào "${collection}".\n`);
process.exit(0);
