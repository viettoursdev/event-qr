# event-qr — QR code thông tin bàn tiệc cho khách dự sự kiện

Mỗi khách có một mã QR riêng (in sẵn tên + công ty lên ảnh). Khách quét → mở trang web
hiển thị **họ tên · công ty · số bàn**. Web app chạy tĩnh trên **GitHub Pages** (miễn phí, không server).

## ⭐ Điểm quan trọng: QR cố định, nội dung đổi được

- Mỗi khách gắn với một **token cố định** (lưu ở `private/tokens.json`). QR mã hóa token này.
- Bạn có thể **xuất & in QR ngay bây giờ dù chưa có số bàn**. Khi nào chốt bàn, chỉ cần
  điền vào Excel → chạy lại `npm run import` → **token không đổi** → deploy lại thư mục `docs/`.
  **Không phải in lại QR.** Web sẽ tự hiển thị số bàn mới.
- Lúc chưa có bàn, trang web hiển thị *"Đang cập nhật — quét lại gần giờ sự kiện"*.

> ⚠️ Giữ file `private/tokens.json` — đây là thứ khóa token cố định. Mất nó, các QR đã in coi như mất liên kết.

## Bảo mật / riêng tư

- Token ngẫu nhiên → link không đoán được; mỗi khách là một file riêng `docs/g/<token>.json`
  nên không ai liệt kê được toàn bộ danh sách.
- Chỉ đưa lên web **3 trường: tên · công ty · bàn**. Không có thông tin cá nhân nào khác.
- Nên để **repo GitHub ở chế độ Private**.

## Các bước sử dụng

```bash
cd event-qr
npm install                       # cài thư viện (chạy 1 lần)

# 1) Đặt file Excel vào: data/guests.xlsx  (cột: Họ và tên | Công ty | Số bàn)
#    Số bàn có thể để TRỐNG lúc này.
# 2) Mở config.mjs, sửa:
#    - columns.name / company / table  -> khớp tên cột trong Excel
#    - baseUrl  -> https://<github-username>.github.io/<tên-repo>/

npm run import     # đọc Excel -> sinh dữ liệu + token (cố định)
npm run qr         # sinh ảnh QR (in sẵn tên) + private/print.html
#  (npm run build = chạy gộp import + qr)

npm run preview    # xem thử trang web ở máy
```

### Khi đã chốt số bàn (làm sau, không cần in lại QR)

```bash
# điền cột "Số bàn" trong data/guests.xlsx
npm run import     # token giữ nguyên, chỉ cập nhật nội dung
# rồi git push lại thư mục docs/  -> xong
```

## Kết quả

| File | Mục đích | Công khai? |
|------|----------|-----------|
| `docs/` | Trang web → deploy lên GitHub Pages | ✅ (chỉ tên · công ty · bàn) |
| `private/qr/<STT>_<Tên>_<token>.png` | Ảnh QR từng khách, đã in tên lên ảnh | ❌ giữ riêng |
| `private/print.html` | Trang in tất cả thẻ (→ ⌘/Ctrl+P → Lưu PDF) | ❌ giữ riêng |
| `private/master.csv` | Bảng tra cứu token ↔ khách | ❌ giữ riêng |
| `private/tokens.json` | ⭐ Bản đồ token cố định — **GIỮ LẠI** | ❌ giữ riêng |

## Giữ token cố định an toàn hơn (tùy chọn)

Mặc định token khóa theo **tên + công ty** (`keyColumns`). Nếu sau khi in QR mà bạn còn
sửa tên/công ty thì token có thể đổi. An toàn nhất: thêm một cột mã khách duy nhất
(vd `Mã khách` hoặc `STT`) vào Excel và đặt `idColumn: "Mã khách"` trong `config.mjs`.

## Deploy lên GitHub Pages

1. Tạo repo GitHub (nên **Private**), push code.
2. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch `main`, thư mục `/docs`.
3. ~1 phút sau web sống tại `https://<username>.github.io/<repo>/`.
4. ⚠️ URL phải khớp `config.baseUrl`. Đổi baseUrl thì chạy lại `npm run build`.
