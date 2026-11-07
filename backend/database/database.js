const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "reward.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // ==========================
    // Rewards Table (On-chain verified records)
    // ==========================
    db.run(`
        CREATE TABLE IF NOT EXISTS rewards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT,
            transactionHash TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ==========================
    // Students Table
    // ==========================
    db.run(`
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            studentId TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            wallet TEXT UNIQUE NOT NULL,
            email TEXT
        )
    `);

    // ==========================
    // Users Table
    // ==========================
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            studentId TEXT,
            name TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ==========================
    // Proposals Table (Teacher proposals submitted to Admin)
    // ==========================
    db.run(`
        CREATE TABLE IF NOT EXISTS proposals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacherUsername TEXT NOT NULL,
            teacherName TEXT,
            studentId TEXT NOT NULL,
            studentName TEXT,
            studentWallet TEXT NOT NULL,
            amount INTEGER NOT NULL,
            reason TEXT NOT NULL,
            status TEXT DEFAULT 'PENDING',
            transactionHash TEXT,
            rejectReason TEXT,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ==========================
    // Teacher Whitelist Table (Single Sign-On SSO)
    // ==========================
    db.run(`
        CREATE TABLE IF NOT EXISTS teacher_whitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            department TEXT DEFAULT 'Khoa Công nghệ Thông tin',
            role TEXT DEFAULT 'TEACHER',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ==========================
    // Table migrations
    // ==========================
    db.run(`ALTER TABLE users ADD COLUMN name TEXT`, (err) => {
        // Ignore duplicate column error if already exists
    });

    // ==========================
    // Seed Whitelist Teachers
    // ==========================
    db.run(`
        INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
        VALUES ('nvthanh@ictu.edu.vn', 'TS. Nguyễn Văn Thành', 'Khoa Công nghệ Thông tin', 'TEACHER')
    `);
    db.run(`
        INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
        VALUES ('teacher@ictu.edu.vn', 'TS. Nguyễn Văn Thành', 'Khoa Công nghệ Thông tin', 'TEACHER')
    `);
    db.run(`
        INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
        VALUES ('ptthao@ictu.edu.vn', 'ThS. Phan Thị Thảo', 'Khoa Khoa học Máy tính', 'TEACHER')
    `);
    db.run(`
        INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
        VALUES ('admin@ictu.edu.vn', 'Ban Quản trị Trường ICTU', 'Phòng Đào tạo & NCKH', 'ADMIN')
    `);

    // ==========================
    // Seed Default Accounts
    // ==========================

    // Ensure teachers with SSO have default login password
    db.run(`UPDATE users SET password = '123456' WHERE password = 'SSO_AUTHORIZED'`);

    // 1. ADMIN ACCOUNTS
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('admin', '123456', 'ADMIN', NULL, 'Ban Quản trị Trường ICTU')
    `);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('admin@ictu.edu.vn', '123456', 'ADMIN', NULL, 'Ban Quản trị Trường ICTU')
    `);

    // 2. TEACHER ACCOUNTS (Email @ictu.edu.vn)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('nvthanh@ictu.edu.vn', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
    `);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('ptthao@ictu.edu.vn', '123456', 'TEACHER', NULL, 'ThS. Phan Thị Thảo - Khoa KHMT')
    `);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('teacher@ictu.edu.vn', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
    `);
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('teacher', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
    `);

    // 3. STUDENT 1: Pham Minh Hoa (Mã SV: DTC235180075)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('dtc235180075', 'ictu@123456', 'STUDENT', 'DTC235180075', 'Phạm Minh Hòa')
    `);
    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC235180075', 'Phạm Minh Hòa', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'dtc235180075@ictu.edu.vn')
    `);

    // 4. STUDENT 2: Tran Van Nam (Mã SV: DTC235180076)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('dtc235180076', 'ictu@123456', 'STUDENT', 'DTC235180076', 'Trần Văn Nam')
    `);
    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC235180076', 'Trần Văn Nam', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'dtc235180076@ictu.edu.vn')
    `);

    // 5. STUDENT 3: Nguyen Thi Lan (Mã SV: DTC235180077)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('dtc235180077', 'ictu@123456', 'STUDENT', 'DTC235180077', 'Nguyễn Thị Lan')
    `);
    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC235180077', 'Nguyễn Thị Lan', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'dtc235180077@ictu.edu.vn')
    `);

    // 6. Legacy compatibility seeds for tests
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId, name)
        VALUES ('hoa', '123456', 'STUDENT', 'DTC001', 'Phạm Minh Hòa')
    `);
    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC001', 'Phạm Minh Hòa', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'hoa@ictu.edu.vn')
    `);
});

module.exports = db;