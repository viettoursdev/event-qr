// =====================================================================
//  import.mjs — Đọc Excel -> sinh dữ liệu khách, GIỮ TOKEN CỐ ĐỊNH
// =====================================================================
//  • Token của mỗi khách được lưu trong private/tokens.json và TÁI SỬ DỤNG
//    ở các lần chạy sau -> QR đã in vẫn dùng được, chỉ nội dung (số bàn) đổi.
//  Tạo ra:
//   - docs/g/<token>.json   : dữ liệu CÔNG KHAI (tên, công ty, bàn) cho web
//   - docs/config.json      : thông tin sự kiện cho web
//   - private/guests.index.json : danh sách đầy đủ (RIÊNG TƯ) cho bước QR
//   - private/master.csv    : bảng tra cứu token <-> khách (RIÊNG TƯ)
//   - private/tokens.json   : ⭐ bản đồ khóa->token (GIỮ LẠI, đừng xóa!)
// =====================================================================

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import { config } from "../config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const p = (...x) => path.join(root, ...x);

// Bảng chữ cái sinh token — bỏ ký tự dễ nhầm (0/O, 1/l/I)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
function makeToken(len = 7) {
  const bytes = crypto.randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function fail(msg) {
  console.error("\n❌ " + msg + "\n");
  process.exit(1);
}

// --- Đọc workbook ---
const inputPath = p(config.inputFile);
if (!fs.existsSync(inputPath)) {
  fail(`Không tìm thấy file Excel: ${config.inputFile}\n   → Hãy đặt file danh sách khách vào đúng đường dẫn này.`);
}
const wb = XLSX.readFile(inputPath);
const sheetName = config.sheetName || wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
if (!sheet) fail(`Không tìm thấy sheet "${sheetName}". Các sheet có sẵn: ${wb.SheetNames.join(", ")}`);

const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", range: config.headerRow || 0 });
if (rows.length === 0) fail("Sheet rỗng — không có dòng dữ liệu nào.");

const headers = Object.keys(rows[0]);
console.log(`\n📄 Đọc sheet "${sheetName}" — ${rows.length} dòng.`);
console.log(`   Các cột phát hiện: ${headers.map((h) => `"${h}"`).join(", ")}`);

// --- Kiểm tra cột ---
const { name: nameCol, company: companyCol, table: tableCol, title: titleCol } = config.columns;
if (!headers.includes(nameCol)) {
  fail(
    `Không thấy cột "${nameCol}" (cấu hình cho "name") trong Excel.\n` +
      `   → Sửa config.mjs > columns.name cho khớp một trong các cột trên.`
  );
}
if (companyCol && !headers.includes(companyCol))
  console.log(`   ⚠️ Không thấy cột công ty "${companyCol}" — sẽ bỏ qua.`);
if (tableCol && !headers.includes(tableCol))
  console.log(`   ⚠️ Chưa có cột số bàn "${tableCol}" — vẫn xuất QR được, điền bàn sau.`);

// --- Khóa định danh (để token cố định) ---
const { idColumn, keyColumns } = config;
if (idColumn && !headers.includes(idColumn))
  fail(`idColumn "${idColumn}" không có trong Excel. Sửa lại config.mjs (hoặc để "").`);

function get(row, key) {
  // key là tên logic (name/company/table) -> map sang cột Excel
  const colMap = { name: nameCol, company: companyCol, table: tableCol, title: titleCol };
  const col = colMap[key] || key;
  return String(row[col] ?? "").trim();
}
function buildKey(row, seenCounts) {
  let base;
  if (idColumn) base = "id:" + String(row[idColumn] ?? "").trim();
  else base = "k:" + keyColumns.map((k) => get(row, k)).join("|");
  // chống trùng khóa trong cùng một lần import (vd 2 khách trùng tên+công ty)
  const n = (seenCounts.get(base) || 0) + 1;
  seenCounts.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

// --- Tải bản đồ token đã có (token cố định) ---
const tokensPath = p("private", "tokens.json");
fs.mkdirSync(p("private"), { recursive: true });
let tokenMap = {};
if (fs.existsSync(tokensPath)) {
  try {
    tokenMap = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
  } catch {
    fail("private/tokens.json bị hỏng — không đọc được. Hãy kiểm tra lại file này.");
  }
}
const usedTokens = new Set(Object.values(tokenMap));

// --- Dọn dữ liệu web cũ (token thì giữ nguyên qua tokenMap) ---
const gDir = p("docs", "g");
fs.rmSync(gDir, { recursive: true, force: true });
fs.mkdirSync(gDir, { recursive: true });

// --- Sinh dữ liệu ---
const seenCounts = new Map();
const index = [];
let reused = 0,
  created = 0,
  blankNames = 0,
  blankTables = 0;

for (const row of rows) {
  const key = buildKey(row, seenCounts);

  let token = tokenMap[key];
  if (token) {
    reused++;
  } else {
    do {
      token = makeToken(7);
    } while (usedTokens.has(token));
    usedTokens.add(token);
    tokenMap[key] = token;
    created++;
  }

  const name = get(row, "name");
  const company = companyCol ? get(row, "company") : "";
  const table = tableCol && headers.includes(tableCol) ? get(row, "table") : "";
  const title = titleCol && headers.includes(titleCol) ? get(row, "title") : "";
  if (!name) blankNames++;
  if (!table) blankTables++;

  // Dữ liệu CÔNG KHAI cho web
  const stt = idColumn ? String(row[idColumn] ?? "").trim() : "";
  const pub = { name };
  if (title) pub.title = title;
  if (company) pub.company = company;
  if (stt) pub.stt = stt;
  pub.table = table; // có thể rỗng -> web hiển thị "Đang cập nhật"
  fs.writeFileSync(p("docs", "g", `${token}.json`), JSON.stringify(pub));

  index.push({
    token,
    url: config.baseUrl.replace(/\/?$/, "/") + "#" + token,
    stt,
    title,
    name,
    company,
    table,
  });
}

// --- Ghi token map (QUAN TRỌNG: giữ lại để token cố định) ---
fs.writeFileSync(tokensPath, JSON.stringify(tokenMap, null, 2));

// --- Ghi config cho web ---
fs.writeFileSync(
  p("docs", "config.json"),
  JSON.stringify(
    {
      eventName: config.eventName,
      eventSubtitle: config.eventSubtitle,
      footerNote: config.footerNote,
      confirmDeadline: config.confirmDeadline || "",
    },
    null,
    2
  )
);

// --- File riêng tư ---
fs.writeFileSync(p("private", "guests.index.json"), JSON.stringify(index, null, 2));

const csvCols = ["token", "url", "name", "company", "table"];
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const csv =
  "﻿" + [csvCols.join(",")].concat(index.map((r) => csvCols.map((c) => esc(r[c])).join(","))).join("\r\n");
fs.writeFileSync(p("private", "master.csv"), csv);

console.log(`\n✅ Xử lý ${index.length} khách — token mới: ${created}, token giữ nguyên: ${reused}.`);
console.log(`   • docs/g/*.json          (dữ liệu web: tên, công ty, bàn)`);
console.log(`   • private/tokens.json    (⭐ bản đồ token — GIỮ LẠI, đừng xóa)`);
console.log(`   • private/master.csv     (bảng tra cứu)`);
if (blankNames) console.log(`   ⚠️ ${blankNames} dòng thiếu tên — kiểm tra lại Excel.`);
if (blankTables) console.log(`   ℹ️ ${blankTables} khách chưa có số bàn — web sẽ hiển thị "Đang cập nhật".`);
if (created > 0 && reused > 0)
  console.log(`\n   ↻ Cập nhật xong. Chỉ cần deploy lại thư mục docs/, KHÔNG cần in lại QR.`);
console.log("");
