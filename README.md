# 🎓 ICTU BLOCKCHAIN REWARD SYSTEM
### Hệ thống Quản lý và Khen thưởng Sinh viên dựa trên Công nghệ Blockchain
**Đề tài Nghiên cứu Khoa học Sinh viên - Trường Đại học Công nghệ Thông tin và Truyền thông (ICTU)**

---

## 🌟 Giới thiệu Dự án
Dự án nghiên cứu và phát triển giải pháp số hóa khen thưởng thành tích học tập, nghiên cứu khoa học của sinh viên trường Đại học Công nghệ Thông tin và Truyền thông (ICTU) dưới dạng Token ERC-20 (`ICTU Reward Token`) trên nền tảng chuỗi khối Ethereum (EVM).

### ✨ Các tính năng chính:
- **Smart Contracts (Solidity v0.8.20):**
  - `RewardToken.sol`: Token ERC-20 với cơ chế phân quyền `AccessControl` (`MINTER_ROLE`).
  - `RewardManager.sol`: Hợp đồng quản lý trao thưởng bảo vệ bởi `Ownable`, phát sinh sự kiện `RewardIssued`.
- **Backend API (Node.js & Express):**
  - Xác thực bảo mật JWT, mã hóa mật khẩu với `bcrypt`.
  - Phân quyền theo vai trò (Role-Based Access Control: `ADMIN` vs `STUDENT`).
  - Tích hợp `ethers.js` v6 kết nối mạng Blockchain và lưu trữ cơ sở dữ liệu SQLite (`reward.db`).
- **Giao diện Web Frontend Hiện đại:**
  - **Trang Quản trị (Admin Portal - `index.html`):** Tổng quan số liệu thống kê thời gian thực, trao thưởng on-chain, quản lý sinh viên (Thêm/Sửa/Xóa), lịch sử phân trang và Bảng xếp hạng Top 10 sinh viên xuất sắc.
  - **Cổng Sinh viên (Student Portal - `student.html`):** Xem hồ sơ cá nhân, địa chỉ ví, số dư token và chi tiết biên lai giao dịch điện tử.
  - **Trang Đăng nhập (`login.html`):** Giao diện glassmorphism hiện đại, hỗ trợ nút đăng nhập demo 1 chạm cho Admin và Sinh viên.

---

## 📁 Cấu trúc Thư mục

```text
D:\NCKH_Blockchain\
├── contracts/                        # Mã nguồn hợp đồng thông minh Solidity
│   ├── RewardToken.sol               # Smart Contract Token ERC-20
│   └── RewardManager.sol             # Smart Contract Quản lý Trao thưởng
├── test/                             # Kiểm thử Hợp đồng Thông minh
│   ├── RewardToken.test.ts
│   └── RewardManager.test.ts
├── scripts/                          # Scripts Triển khai & Cấu hình
│   ├── deployRewardSystem.ts         # Script triển khai hợp đồng & cấp MINTER_ROLE tự động
│   └── setupRole.ts                  # Script kiểm tra và cấp quyền
├── backend/                          # Máy chủ RESTful API Backend
│   ├── contracts/                    # ABI Smart Contracts
│   ├── database/                     # SQLite database & khởi tạo bảng
│   │   ├── database.js
│   │   └── reward.db
│   ├── middleware/                   # Middleware xác thực JWT & phân quyền
│   ├── routes/                       # Các API routes (auth, student, reward)
│   ├── services/                     # Dịch vụ kết nối Blockchain ethers.js
│   ├── server.js                     # Điểm khởi chạy máy chủ Express
│   ├── test-integration.js           # Bộ kiểm thử tích hợp 15 test cases
│   ├── run-self-test.js              # Script tự kiểm tra toàn bộ luồng
│   ├── .env                          # Cấu hình môi trường
│   └── .env.example
├── frontend/                         # Giao diện Web Người dùng
│   ├── index.html                    # Giao diện Quản trị viên
│   ├── app.js                        # Logic Quản trị viên
│   ├── student.html                  # Cổng thông tin Sinh viên
│   ├── student.js                    # Logic Cổng Sinh viên
│   ├── login.html                    # Giao diện Đăng nhập
│   ├── login.js                      # Logic Đăng nhập
│   ├── auth.js                       # Tiện ích xác thực, Toast & định dạng
│   └── style.css                     # Hệ thống thiết kế CSS đồng nhất
├── docs/                             # Tài liệu Nghiên cứu Khoa học
│   └── BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md
└── start_project.bat                 # Script khởi động tự động toàn bộ hệ thống
```

---

## 🚀 Hướng dẫn Cài đặt và Vận hành

### Cách 1: Khởi động tự động 1 chạm (Khuyên dùng)
Nhấp đúp chuột vào tệp `start_project.bat` tại thư mục gốc. Hệ thống sẽ tự động thực hiện:
1. Khởi động Hardhat Node giả lập chuỗi khối tại `http://127.0.0.1:8545`.
2. Triển khai Smart Contracts và tự động cấp `MINTER_ROLE`.
3. Khởi động Backend tại `http://localhost:3000`.
4. Khởi động Web Frontend tại `http://localhost:5500`.

### Cách 2: Khởi động thủ công từng bước

#### 1. Khởi động Hardhat Blockchain Node
```bash
npx hardhat node
```

#### 2. Triển khai Smart Contracts
```bash
npx hardhat run scripts/deployRewardSystem.ts --network localhost
```

#### 3. Khởi động Backend API
```bash
cd backend
node server.js
```

#### 4. Khởi động Frontend
```bash
cd frontend
python -m http.server 5500
```
Truy cập trình duyệt:
- **Đăng nhập:** [http://localhost:5500/login.html](http://localhost:5500/login.html)
- **Quản trị viên:** [http://localhost:5500/index.html](http://localhost:5500/index.html)
- **Cổng Sinh viên:** [http://localhost:5500/student.html](http://localhost:5500/student.html)

---

## 👥 Tài khoản Thử nghiệm (Demo Accounts)

| Vai trò | Tên đăng nhập | Mật khẩu | Ghi chú |
|:---|:---:|:---:|:---|
| **Admin Quản trị** | `admin` | `123456` | Toàn quyền trao thưởng & quản lý sinh viên |
| **Sinh viên Hoa** | `hoa` | `123456` | Mã SV `DTC001` (Account #1 Hardhat) |
| **Sinh viên Nam** | `nam` | `123456` | Mã SV `DTC002` (Account #2 Hardhat) |
| **Sinh viên Lan** | `lan` | `123456` | Mã SV `DTC003` (Account #3 Hardhat) |

---

## 🧪 Kết quả Kiểm thử (Testing)

### 1. Kiểm thử Smart Contract (Hardhat Mocha)
```bash
npx hardhat test
```
- **Kết quả:** `6 passing (6 mocha)` - 100% đạt chuẩn.

### 2. Kiểm thử Tích hợp Toàn diện (Integration Tests)
```bash
node backend/run-self-test.js
```
- **Kết quả:** `15 PASSED | 0 FAILED` - Xác thực đăng nhập, RBAC phân quyền, xử lý lỗi đầu vào, tra cứu hồ sơ và phân trang.

---

## 📄 Tài liệu Nghiên cứu Khoa học
Xem báo cáo chi tiết tại: [BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md](docs/BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md)
