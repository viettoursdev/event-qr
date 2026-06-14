// =====================================================================
//  CẤU HÌNH APP CHECK-IN
//  • Khi apiKey còn rỗng -> trang chạy CHẾ ĐỘ DEMO (dữ liệu mẫu, không lưu).
//  • Điền cấu hình Firebase thật vào đây để chạy thật (xem CHECKIN-SETUP.md).
//  Lưu ý: firebaseConfig KHÔNG phải bí mật — bảo mật nằm ở Firestore Rules + đăng nhập.
// =====================================================================

export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

// Tài khoản nhân viên dùng chung (tạo trong Firebase Auth > Email/Password).
// Nhân viên chỉ cần nhập "Mã nhân viên" = mật khẩu của tài khoản này.
export const staffEmail = "checkin@viettours.local";

export const eventName = "Kỷ niệm Viettours 25 năm";

// --- Dữ liệu mẫu chỉ dùng cho CHẾ ĐỘ DEMO ---
export const demoGuests = [
  { id: "1", stt: 1, name: "Nguyễn Cẩm Phương", company: "Amway", phone: "0903123456", table: "5" },
  { id: "2", stt: 2, name: "Nguyễn Cẩm Phương", company: "Amway", phone: "0907654321", table: "8" },
  { id: "3", stt: 3, name: "Trần Thị Bình", company: "4 Oranges", phone: "0912000111", table: "15" },
  { id: "4", stt: 4, name: "Lê Hoàng Cường", company: "Simpson Strong-Tie Viet Nam", phone: "0988777666", table: "" },
  { id: "5", stt: 5, name: "Phạm Thu Hà", company: "Abbott", phone: "0901222333", table: "3" },
  { id: "6", stt: 6, name: "Vũ Ngọc Sơn", company: "Prudential", phone: "0934555888", table: "12" },
  { id: "7", stt: 7, name: "Đoàn Thanh Anh", company: "Amway", phone: "0967111222", table: "5" },
];
