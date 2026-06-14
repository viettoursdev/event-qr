# Hướng dẫn cài app Check-in (Firebase)

App check-in nằm ở `docs/checkin/` → khi deploy sẽ sống tại
**https://viettoursdev.github.io/event-qr/checkin/**

- Tìm khách theo **tên / SĐT / công ty** (gõ một phần, không dấu vẫn ra).
- Trùng tên+công ty → hiện danh sách để chọn đúng.
- Check-in **đồng bộ realtime giữa nhiều máy**, ghi giờ + tên quầy, có hoàn tác.
- Cổng **PIN**: phải đăng nhập mới xem được SĐT khách.

> Hiện app đang chạy **CHẾ ĐỘ DEMO** (dữ liệu mẫu). Làm xong các bước dưới để chạy thật.

---

## A. Tạo Firebase (làm 1 lần, ~10 phút, miễn phí)

1. Vào https://console.firebase.google.com → **Add project** → đặt tên (vd `viettours-checkin`).
   Có thể tắt Google Analytics. Gói **Spark (miễn phí)** là đủ.

2. **Firestore Database** → *Create database* → chọn **Production mode** → vùng `asia-southeast1` (Singapore).

3. Mở tab **Rules**, dán toàn bộ nội dung file [`firestore.rules`](firestore.rules) trong repo này → **Publish**.

4. **Authentication** → *Get started* → bật **Email/Password**.
   Sang tab **Users** → *Add user*:
   - Email: `checkin@viettours.local` (hoặc email bạn thích)
   - Password: **đây chính là mã PIN** nhân viên sẽ nhập → đặt mã đủ khó (vd `Viettours@25`).

5. **Project settings** (bánh răng) → mục *Your apps* → bấm icon **Web** (`</>`) → đăng ký app →
   copy đoạn `firebaseConfig` (apiKey, projectId…).

6. Cũng trong **Project settings → Service accounts** → *Generate new private key* →
   tải file JSON về, đổi tên & lưu thành: `private/serviceAccount.json` trong repo.
   (Thư mục `private/` đã được gitignore — file này KHÔNG bị đẩy lên GitHub.)

---

## B. Cắm cấu hình vào app

Mở `docs/checkin/config.js`, điền:

```js
export const firebaseConfig = {  // dán từ bước A5
  apiKey: "AIza...", authDomain: "...", projectId: "...",
  storageBucket: "...", messagingSenderId: "...", appId: "...",
};
export const staffEmail = "checkin@viettours.local"; // đúng email ở bước A4
```

(Để `eventName` như cũ.) Khi `apiKey` đã có, app tự rời chế độ DEMO.

---

## C. Nạp danh sách khách (có SĐT) lên Firestore

1. Chuẩn bị file `data/checkin.xlsx` — **giống file QR nhưng thêm cột SĐT**.
   Cột mặc định: `STT`, `TÊN KHÁCH MỜI`, `TÊN CÔNG TY`, `Số điện thoại`, `Số bàn`
   (sửa tên cột trong `config.mjs > checkin.columns` nếu khác).

2. Chạy:
   ```bash
   npm install            # lần đầu, để cài firebase-admin
   npm run checkin:import
   ```
   Chạy lại bất cứ lúc nào để cập nhật — **không mất** trạng thái đã check-in.

---

## D. Đưa lên mạng

```bash
git add docs/checkin config.mjs package.json scripts firestore.rules
git commit -m "Thêm app check-in"
git push
```

Sau ~1 phút, mở **https://viettoursdev.github.io/event-qr/checkin/** trên mỗi máy đón khách:
nhập **tên quầy** + **mã PIN** → tìm khách → bấm **Check-in**. Mọi máy thấy nhau realtime.

---

## Lưu ý bảo mật
- Trang check-in công khai nhưng **không xem được dữ liệu nếu chưa nhập PIN** (chặn bởi Firestore Rules + đăng nhập).
- Đặt mã PIN đủ khó, đừng dùng `1234`. Khi sự kiện xong có thể đổi mật khẩu user đó để khoá truy cập.
- `private/serviceAccount.json` là chìa khoá admin — giữ kín, không chia sẻ, không commit (đã gitignore).
