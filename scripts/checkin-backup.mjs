// =====================================================================
//  checkin-backup.mjs — Sao lưu collection check-in trên Firestore ra JSON
// =====================================================================
//  • Đọc TOÀN BỘ collection `event_guests` (mọi trạng thái check-in/xác nhận)
//    và ghi ra file JSON có dấu thời gian trong private/backups/.
//  • Thư mục private/ đã gitignore → backup KHÔNG bị đẩy lên GitHub.
//  • CHỈ ĐỌC — không bao giờ ghi/xoá gì trên Firestore.
//
//  Dùng:
//    npm run checkin:backup           # sao lưu thủ công ngay
//  Hoặc gọi backupCollection(db, ...) từ script khác (vd trước khi GHI ĐÈ).
//
//  Cần: private/serviceAccount.json (tải từ Firebase Console).
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);

/**
 * Đọc toàn bộ collection và ghi ra private/backups/<collection>-<stamp>-<label>.json
 * @returns {Promise<{file: string, count: number}>}
 */
export async function backupCollection(db, collection, label = "manual") {
  const snap = await db.collection(collection).get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = p("private", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${collection}-${stamp}-${label}.json`);

  fs.writeFileSync(
    file,
    JSON.stringify(
      { collection, backedUpAt: new Date().toISOString(), label, count: docs.length, docs },
      null,
      2
    ),
    "utf8"
  );
  return { file, count: docs.length };
}

// --- Chạy trực tiếp: tự khởi tạo Firebase rồi sao lưu ---
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (runDirectly) {
  const cfg = config.checkin;
  const saPath = p(cfg.serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error(`\n❌ Thiếu service account: ${cfg.serviceAccount}\n   → Tải từ Firebase Console (xem CHECKIN-SETUP.md).\n`);
    process.exit(1);
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(saPath, "utf8"))) });
  const db = admin.firestore();

  // Dọn backup cũ hơn 30 ngày để khỏi phình thư mục.
  const dir = p("private", "backups");
  if (fs.existsSync(dir)) {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const f of fs.readdirSync(dir)) {
      const fp = path.join(dir, f);
      try {
        if (fs.statSync(fp).mtimeMs < cutoff) fs.unlinkSync(fp);
      } catch {}
    }
  }

  const { file, count } = await backupCollection(db, cfg.collection, "daily");
  console.log(`\n✅ Đã sao lưu ${count} khách (collection "${cfg.collection}").`);
  console.log(`   → ${path.relative(root, file)}\n`);
  process.exit(0);
}
