// =====================================================================
//  CẤU HÌNH — Sửa file này cho khớp với sự kiện và file Excel của bạn.
// =====================================================================

export const config = {
  // --- Thông tin sự kiện (hiển thị trên trang web) ---
  eventName: "Kỷ niệm Viettours 25 năm",
  eventSubtitle: "ÂN TÌNH VẠN DẶM",
  footerNote:
    "Quý khách vui lòng xác nhận tham dự và xác nhận ăn chay (nếu có) trước ngày 25/06/2026 để công tác phục vụ được chu đáo. Mọi thắc mắc cần hỗ trợ, xin vui lòng liên hệ hotline 0919 51 7777.\nXin hẹn gặp lại quý khách tại sự kiện",

  // Hạn chót khách tự bấm "Xác nhận tham dự" trên trang QR. Sau mốc này nút bị KHOÁ.
  // Định dạng ISO kèm múi giờ VN (+07:00). Để "" nếu không giới hạn thời gian.
  confirmDeadline: "2026-07-01T17:30:00+07:00",

  // Số bàn bị ẩn ("Đang cập nhật") cho tới mốc này, sau đó tự hiển thị.
  // 10:00 sáng ngày 29/06 (giờ VN) — khớp thông báo trên trang QR. Để "" nếu muốn hiện ngay.
  tableRevealAt: "2026-06-29T10:00:00+07:00",

  // --- URL gốc nơi web app được host trên GitHub Pages ---
  // Sau khi tạo repo GitHub tên "event-qr" với username "tuanhoang",
  // địa chỉ sẽ là: https://tuanhoang.github.io/event-qr/
  // ⚠️ Cập nhật dòng này TRƯỚC khi chạy "npm run qr" (vì QR mã hóa URL này).
  baseUrl: "https://viettoursdev.github.io/event-qr/",

  // --- File Excel đầu vào (đặt trong thư mục data/) ---
  inputFile: "data/guests.xlsx",
  sheetName: null, // null = dùng sheet đầu tiên; hoặc đặt tên sheet cụ thể
  headerRow: 2, // dòng chứa tiêu đề cột (0 = dòng đầu). V3 có tựa đề + 1 dòng trống -> header ở dòng index 2.

  // --- Ánh xạ cột: sửa giá trị bên PHẢI cho khớp tên CỘT (header) trong Excel ---
  // Chỉ "name" bắt buộc. "table" có thể để trống lúc đầu, điền sau cũng được.
  columns: {
    name: "TÊN KHÁCH MỜI", // bắt buộc
    title: "DANH XƯNG",    // tùy chọn — danh xưng (Ông/Bà) hiển thị trước tên
    position: "CHỨC VỤ",   // tùy chọn — chức vụ, hiển thị dưới tên
    company: "ĐƠN VỊ",     // tùy chọn — hiển thị dưới tên; để "" nếu không có
    table: "SỐ BÀN",       // có thể bỏ trống lúc xuất QR, cập nhật sau
  },

  // --- KHÓA ĐỊNH DANH để GIỮ TOKEN CỐ ĐỊNH giữa các lần import ---
  // Token = phần cố định trong QR. Đã in QR rồi thì token KHÔNG được đổi.
  // • Nếu Excel có cột mã khách / STT duy nhất → điền tên cột đó vào idColumn
  //   (an toàn nhất; bạn có thể sửa tên/công ty thoải mái mà token không đổi).
  // • Nếu không có → để idColumn = "" và token sẽ khóa theo keyColumns bên dưới
  //   (lúc đó KHÔNG nên sửa tên/công ty sau khi đã in QR).
  idColumn: "STT",
  keyColumns: ["name", "company"],

  // --- Tùy chọn QR & in ---
  qr: {
    pngSize: 560,         // kích thước phần mã QR (px)
    margin: 1,            // viền trắng quanh QR (module)
    darkColor: "#111111",
    lightColor: "#ffffff",
    nameOnImage: true,    // in tên + công ty thẳng lên ảnh QR
    // Bố cục trang in (print.html) — số thẻ mỗi hàng/cột trên 1 trang A4
    cardsPerRow: 2,
    cardsPerCol: 4,
  },

  // --- App CHECK-IN (Firebase) — chỉ dùng cho scripts/checkin-import.mjs ---
  // DÙNG CHUNG 1 file Excel với phần QR (data/guests.xlsx), chỉ cần thêm cột SĐT.
  // Cả hai pipeline khóa theo STT nên đồng bộ tự nhiên. SĐT chỉ nạp lên Firestore,
  // KHÔNG bao giờ lên trang web tĩnh công khai (import QR chỉ lấy tên/công ty/bàn).
  checkin: {
    inputFile: "data/guests.xlsx", // cùng file với QR; chỉ cần có thêm cột SĐT
    serviceAccount: "private/serviceAccount.json", // tải từ Firebase Console (gitignored)
    collection: "event_guests", // collection riêng, tách khỏi dữ liệu app tính giá cùng project
    columns: {
      stt: "STT",
      name: "TÊN KHÁCH MỜI",
      position: "CHỨC VỤ", // chức vụ hiển thị trên thẻ check-in
      company: "ĐƠN VỊ",
      phone: "ĐT LIÊN LẠC", // cột SĐT để tìm trong check-in
      table: "SỐ BÀN",
    },
  },
};
