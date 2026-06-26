# Sao lưu & an toàn dữ liệu check-in (event-qr)

> Bối cảnh: dữ liệu check-in từng bị mất do chạy GHI ĐÈ (`OVERWRITE=1`) — lệnh đó
> xoá sạch collection `event_guests` rồi nạp lại từ Excel, reset mọi trạng thái
> check-in/xác nhận. Các biện pháp dưới đây để chuyện đó KHÔNG bao giờ lặp lại.

## 1. Khoá an toàn đã thêm vào script GHI ĐÈ
`npm run checkin:overwrite` giờ:
1. **Tự sao lưu** toàn bộ collection ra `private/backups/...-pre-overwrite.json` TRƯỚC khi xoá.
2. **Bắt gõ đúng tên collection** (`event_guests`) để xác nhận. Gõ sai = huỷ, không xoá gì.
3. Tự động hoá có thể bỏ qua xác nhận bằng `FORCE=1` (vẫn backup trước).

→ Dùng hằng ngày: chỉ chạy `npm run checkin:import` (MERGE — giữ nguyên trạng thái, chỉ cập nhật thông tin). **Đừng** dùng `checkin:overwrite` trừ khi thật sự muốn reset.

## 2. Backup thủ công bất cứ lúc nào
```bash
npm run checkin:backup
```
Ghi 1 file JSON có dấu thời gian vào `private/backups/` (đã gitignore, không lên GitHub). Tự dọn file cũ hơn 30 ngày.

## 3. Backup tự động HẰNG NGÀY (2 lớp)

### Lớp A — trên máy Mac (launchd), 12:30 trưa
```bash
cp "scripts/launchd/com.viettours.eventqr.checkin-backup.plist" ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.viettours.eventqr.checkin-backup.plist
launchctl start com.viettours.eventqr.checkin-backup   # chạy thử ngay
```
Log: `private/backups/_cron.log`. Máy tắt lúc đó → launchd chạy bù khi bật lại.

### Lớp B — cloud (GitHub Actions), 12:30 VN
Workflow `.github/workflows/checkin-backup.yml` chạy kể cả khi máy tắt, đẩy backup lên Cloudflare R2 (`event-qr-checkin/YYYY/MM/DD/...`). Cần đặt secrets trong **event-qr repo → Settings → Secrets and variables → Actions**:
- `FIREBASE_SERVICE_ACCOUNT` — dán toàn bộ nội dung `private/serviceAccount.json`
- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, `R2_BUCKET`

⚠️ Repo này PUBLIC — secret an toàn, nhưng tuyệt đối **không commit** `serviceAccount.json` hay file backup (chứa SĐT khách). `.gitignore` đã chặn `private/`.

## 4. Khôi phục khi lỡ tay
```bash
npm run checkin:restore -- private/backups/event_guests-<thời-gian>-pre-overwrite.json
```
Chế độ MERGE: chỉ đắp lại doc trong backup, không xoá doc khác. Cần gõ `yes` xác nhận.
Lấy backup từ R2 (nếu chỉ có trên cloud):
```bash
aws s3 cp s3://<R2_BUCKET>/event-qr-checkin/<YYYY/MM/DD>/<file>.json.gz . --endpoint-url <R2_ENDPOINT>
gunzip <file>.json.gz
npm run checkin:restore -- <file>.json
```
