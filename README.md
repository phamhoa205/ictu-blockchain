# 🎓 ICTU BLOCKCHAIN REWARD SYSTEM
### Hệ thống Quản lý và Khen thưởng Sinh viên dựa trên Công nghệ Blockchain
**Công trình Nghiên cứu Khoa học Sinh viên - Trường Đại học Công nghệ Thông tin và Truyền thông (ICTU)**

---

## 🌟 Giới thiệu Đề tài
Dự án nghiên cứu, thiết kế và phát triển giải pháp số hóa thành tích học tập và nghiên cứu khoa học của sinh viên trường Đại học Công nghệ Thông tin và Truyền thông (ICTU) dưới dạng Token ERC-20 bán linh hồn (**Soulbound Token**) trên nền tảng chuỗi khối EVM.

Hệ thống giải quyết 3 bài toán nghiên cứu cốt lõi:
1. **Cơ chế Soulbound ERC-20 chống mua bán thành tích (`RewardToken.sol`):** Khóa chuyển nhượng ngang hàng P2P (`transferLocked = true`), ngăn chặn hành vi sang nhượng điểm thưởng giữa sinh viên. Chỉ cho phép Nhà trường phát hành (`mint`) và Sinh viên tiêu hủy đổi tiện ích học đường (`burn`).
2. **Quy trình Đa vai trò Giảng viên -> Ban Quản trị (`RewardManager.sol`):** Phân quyền on-chain qua `AccessControl` (`TEACHER_ROLE` và `DEFAULT_ADMIN_ROLE`). Giảng viên tạo đề xuất khen thưởng; Ban Quản trị phê duyệt với cơ chế phòng thủ *Checks-Effects-Interactions* chống duyệt lặp (Double-Approval).
3. **Thuật toán Cấp phát theo lô (Batch Minting) & Băm minh chứng mật mã học:** Gom $N$ sinh viên vào 1 giao dịch `batchIssueReward` duy nhất, lưu mã băm $O(1)$ (`bytes32`), tiết kiệm **55.54% lượng Gas tiêu thụ** tại quy mô 100 sinh viên.

---

## 📁 Cấu trúc Thư mục Toàn diện

```text
D:\NCKH_Blockchain\
├── contracts/                        # Mã nguồn Smart Contracts (Solidity ^0.8.20)
│   ├── RewardToken.sol               # Token Soulbound ERC-20, cờ transferLocked, batchMint
│   └── RewardManager.sol             # RBAC Proposal, Batch Issue, Hash Evidence Anti-Replay
├── test/                             # 14 Kịch bản Kiểm thử Smart Contract toàn diện
│   ├── RewardToken.test.ts           # 6 Test cases (Triển khai, Minter, Khóa P2P, Burn, Mở khóa)
│   └── RewardManager.test.ts         # 8 Test cases (Trao thưởng, Đề xuất, Duyệt, Batch 10 SV, Mismatch)
├── scripts/                          # Kịch bản Thực thi & Đo lường Thực nghiệm
│   ├── deployRewardSystem.ts         # Triển khai tự động & ghi cấu hình contract
│   ├── setupRole.ts                  # Kiểm tra & cấp quyền MINTER_ROLE liên hợp đồng
│   └── benchmarkExperiment.ts        # Kịch bản Đo lường Gas Đối chứng (2 Thí nghiệm Khoa học)
├── backend/                          # Máy chủ RESTful API (Node.js, Express, ethers.js v6)
│   ├── contracts/                    # ABIs đồng bộ tự động từ Artifacts biên dịch
│   │   ├── RewardToken.json
│   │   └── RewardManager.json
│   ├── database/                     # CSDL SQLite (Lưu trữ Metadata, Hồ sơ & Whitelist SSO)
│   │   ├── database.js
│   │   └── reward.db
│   ├── middleware/                   # Middleware xác thực JWT & RBAC (Admin, Teacher, Student)
│   │   └── auth.js
│   ├── routes/                       # Endpoints định tuyến nghiệp vụ (auth, student, reward)
│   ├── services/                     # Khởi tạo kết nối Blockchain Provider & Signer
│   ├── server.js                     # Điểm khởi chạy chính máy chủ Backend (Port 3000)
│   └── test-integration.js           # Bộ 20 Kịch bản Kiểm thử Tích hợp Toàn diện
├── frontend/                         # Giao diện Web Người dùng Đa phân hệ (HTML5, Vanilla JS, CSS)
│   ├── login.html / login.js         # Giao diện Đăng nhập thông minh 2 Tab
│   ├── index.html / app.js           # Cổng Quản trị viên (Dashboard, Quản lý SV, Thống kê)
│   ├── teacher.html / teacher.js     # Cổng Giảng viên (Lập đề xuất, Theo dõi xét duyệt)
│   ├── student.html / student.js     # Cổng Sinh viên (Số dư Real-time, Lịch sử, Biên lai TxHash)
│   ├── auth.js                       # Tiện ích Quản lý Token Client, Toast Notifications
│   └── style.css                     # Hệ thống Design Tokens CSS Glassmorphism đồng nhất
├── docs/                             # Báo cáo Khoa học & Dữ liệu Thực nghiệm
│   ├── BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md
│   ├── benchmark-results.json        # Dữ liệu đo lường Gas thô từ Hardhat EVM
│   └── benchmark-results.md          # Bảng đối chứng chi tiết
├── hardhat.config.ts                 # Cấu hình Hardhat 3, Solidity Compiler & EDR Simulator
└── start_project.bat                 # Script Khởi động 1 chạm tự động toàn hệ thống
```

---

## 🚀 Hướng dẫn Cài đặt và Vận hành

### Cách 1: Khởi động tự động 1 chạm (Khuyên dùng)
Nhấp đúp chuột vào tệp `start_project.bat` tại thư mục gốc. Hệ thống sẽ tự động thực hiện 5 bước:
1. Khởi động mạng chuỗi khối Hardhat Node tại `http://127.0.0.1:8545`.
2. Triển khai Smart Contracts và tự động cấp `MINTER_ROLE`.
3. Khởi động Backend Express tại `http://localhost:3000`.
4. Khởi động Web Frontend tại `http://localhost:5500`.

### Cách 2: Khởi động thủ công từng bước

#### 1. Khởi động Hardhat Blockchain Node
```bash
npx hardhat node
```

#### 2. Triển khai Smart Contracts
```bash
npx hardhat run scripts/deployRewardSystem.ts --network localhost
npx hardhat run scripts/setupRole.ts --network localhost
```

#### 3. Khởi động Backend API
```bash
cd backend
node server.js
```

#### 4. Khởi động Web Frontend
```bash
cd frontend
python -m http.server 5500
```

Truy cập hệ thống trên trình duyệt:
- **Cổng Đăng nhập:** [http://localhost:5500/login.html](http://localhost:5500/login.html)
- **Cổng Quản trị viên (Admin):** [http://localhost:5500/index.html](http://localhost:5500/index.html)
- **Cổng Giảng viên (Teacher):** [http://localhost:5500/teacher.html](http://localhost:5500/teacher.html)
- **Cổng Sinh viên (Student):** [http://localhost:5500/student.html](http://localhost:5500/student.html)

---

## 👥 Danh sách Tài khoản Thử nghiệm (Demo Accounts)

Hệ thống đã nạp sẵn dữ liệu chuẩn hóa trong cơ sở dữ liệu để phục vụ hội đồng nghiệm thu:

| Vai trò người dùng | Phân hệ Đăng nhập | Tài khoản / Email | Mật khẩu | Thông tin Chi tiết & Thẩm quyền |
|:---|:---:|:---:|:---:|:---|
| **Ban Quản trị (Admin)** | Tab Cán bộ / Giảng viên | `admin` | `123456` | Ban Quản trị Trường ICTU - Ký duyệt On-Chain |
| **Giảng viên 1 (Teacher)** | Tab Cán bộ / Giảng viên | `nvthanh@ictu.edu.vn` | `123456` | **TS. Nguyễn Văn Thành** - Khoa CNTT |
| **Giảng viên 2 (Teacher)** | Tab Cán bộ / Giảng viên | `ptthao@ictu.edu.vn` | `123456` | **ThS. Phan Thị Thảo** - Khoa KHMT |
| **Sinh viên 1 (Student)** | Tab Sinh viên | `dtc235180075` | `ictu@123456` | **Phạm Minh Hòa** (Ví: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`) |
| **Sinh viên 2 (Student)** | Tab Sinh viên | `dtc235180076` | `ictu@123456` | **Trần Văn Nam** (Ví: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`) |
| **Sinh viên 3 (Student)** | Tab Sinh viên | `dtc235180077` | `ictu@123456` | **Nguyễn Thị Lan** (Ví: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`) |

---

## 🧪 Kết quả Kiểm thử & Đo lường Thực nghiệm

### 1. Kiểm thử Smart Contract (14/14 Unit Tests Hardhat)
```bash
npx hardhat test
```
- **Kết quả:** `14 passing (14 mocha)` - Đạt **100%**, bao gồm kiểm thử khóa chuyển nhượng P2P, quyền đề xuất Giảng viên, duyệt on-chain chống double-approval và cấp phát theo lô.

### 2. Kiểm thử Tích hợp Toàn diện (20/20 Integration Tests)
```bash
node backend/test-integration.js
```
- **Kết quả:** `20 PASSED | 0 FAILED` - Đạt **100%** qua 7 phân hệ: Health check, Đăng nhập, RBAC, Kiểm soát lỗi đầu vào, Truy vấn sinh viên, Thống kê Admin và Phân hệ Đề xuất Giảng viên.

### 3. Thực nghiệm Đo lường Khoa học (Benchmarking)
Chạy kịch bản thực nghiệm đối chứng tự động:
```bash
npx hardhat run scripts/benchmarkExperiment.ts
```

#### Thí nghiệm 1: Single Minting vs. Batch Minting
| Số lượng SV ($N$) | Phương pháp Cơ sở: $N \times$ `issueReward` | Phương pháp Đề xuất: $1 \times$ `batchIssueReward` | Tỷ lệ Gas Tiết kiệm (%) |
|:---:|:---:|:---:|:---:|
| **$N = 10$** | 691,446 gas | 407,150 gas | **41.12%** |
| **$N = 25$** | 1,728,615 gas | 851,674 gas | **50.73%** |
| **$N = 50$** | 3,457,326 gas | 1,592,640 gas | **53.93%** |
| **$N = 100$** | 6,914,532 gas | 3,074,396 gas | **55.54%** |

#### Thí nghiệm 2: Chuỗi ký tự trực tiếp vs. Mã băm Mật mã học (bytes32)
- Hệ số tăng biên lưu trữ chuỗi: **24.41 gas/byte** (Độ phức tạp $O(L)$ tuyến tính theo độ dài).
- Hệ số tăng biên lưu mã băm: **0.05 gas/byte** (Độ phức tạp $O(1)$ hằng số bất biến).

---

## 📄 Báo cáo Nghiên cứu Khoa học
Xem tài liệu báo cáo nghiên cứu hoàn chỉnh tại: [BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md](docs/BAO_CAO_NGHIEN_CUU_KHOA_HOC_ICTU.md)
