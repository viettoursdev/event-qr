// =====================================================================
//  CẤU HÌNH — Sửa file này cho khớp với sự kiện và file Excel của bạn.
// =====================================================================

export const config = {
  // --- Thông tin sự kiện (hiển thị trên trang web) ---
  eventName: "Tên Sự Kiện Của Bạn",
  eventSubtitle: "Thông tin bàn tiệc của Quý khách",
  footerNote: "Vui lòng liên hệ lễ tân nếu cần hỗ trợ.",

  // --- URL gốc nơi web app được host trên GitHub Pages ---
  // Sau khi tạo repo GitHub tên "event-qr" với username "tuanhoang",
  // địa chỉ sẽ là: https://tuanhoang.github.io/event-qr/
  // ⚠️ Cập nhật dòng này TRƯỚC khi chạy "npm run qr" (vì QR mã hóa URL này).
  baseUrl: "https://viettoursdev.github.io/event-qr/",

  // --- File Excel đầu vào (đặt trong thư mục data/) ---
  inputFile: "data/guests.xlsx",
  sheetName: null, // null = dùng sheet đầu tiên; hoặc đặt tên sheet cụ thể

  // --- Ánh xạ cột: sửa giá trị bên PHẢI cho khớp tên CỘT (header) trong Excel ---
  // Chỉ "name" bắt buộc. "table" có thể để trống lúc đầu, điền sau cũng được.
  columns: {
    name: "TÊN KHÁCH MỜI",   // bắt buộc
    company: "TÊN CÔNG TY",  // tùy chọn — hiển thị dưới tên; để "" nếu không có
    table: "Số bàn",         // có thể bỏ trống lúc xuất QR, cập nhật sau
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
};
