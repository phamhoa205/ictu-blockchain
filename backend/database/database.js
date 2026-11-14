const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

// Kiểm tra cấu hình Turso Cloud SQLite
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;
const isTurso = Boolean(tursoUrl && tursoAuthToken);

let db = null;

if (isTurso) {
    console.log(`🌐 [Database] Kết nối tới Turso Cloud SQLite (${tursoUrl})...`);
    const { createClient } = require("@libsql/client");
    const client = createClient({
        url: tursoUrl,
        authToken: tursoAuthToken
    });

    function normalizeArgs(params) {
        if (params === undefined || params === null) return [];
        if (Array.isArray(params)) return params.map(p => (p === undefined ? null : p));
        return [params === undefined ? null : params];
    }

    /**
     * Lớp bọc (Adapter) giữ nguyên 100% chữ ký callback của sqlite3:
     * - db.run(sql, params, callback): hỗ trợ `this.lastID` và `this.changes`
     * - db.get(sql, params, callback): trả về row plain object
     * - db.all(sql, params, callback): trả về mảng rows
     * - db.serialize(callback)
     */
    class TursoSqliteAdapter {
        constructor(libsqlClient) {
            this.client = libsqlClient;
            this.isTurso = true;
        }

        serialize(fn) {
            if (typeof fn === "function") fn();
            return this;
        }

        parallelize(fn) {
            if (typeof fn === "function") fn();
            return this;
        }

        run(sql, params, cb) {
            if (typeof params === "function") {
                cb = params;
                params = [];
            }
            const args = normalizeArgs(params);
            this.client.execute({ sql, args })
                .then(res => {
                    const ctx = {
                        lastID: res.lastInsertRowid !== undefined ? Number(res.lastInsertRowid) : 0,
                        changes: res.rowsAffected !== undefined ? Number(res.rowsAffected) : 0
                    };
                    if (typeof cb === "function") {
                        cb.call(ctx, null);
                    }
                })
                .catch(err => {
                    if (typeof cb === "function") {
                        cb.call({ lastID: 0, changes: 0 }, err);
                    } else {
                        console.error("Turso run error:", err.message);
                    }
                });
            return this;
        }

        get(sql, params, cb) {
            if (typeof params === "function") {
                cb = params;
                params = [];
            }
            const args = normalizeArgs(params);
            this.client.execute({ sql, args })
                .then(res => {
                    const row = res.rows && res.rows.length > 0 ? { ...res.rows[0] } : undefined;
                    if (typeof cb === "function") {
                        cb(null, row);
                    }
                })
                .catch(err => {
                    if (typeof cb === "function") {
                        cb(err, null);
                    } else {
                        console.error("Turso get error:", err.message);
                    }
                });
            return this;
        }

        all(sql, params, cb) {
            if (typeof params === "function") {
                cb = params;
                params = [];
            }
            const args = normalizeArgs(params);
            this.client.execute({ sql, args })
                .then(res => {
                    const rows = (res.rows || []).map(r => ({ ...r }));
                    if (typeof cb === "function") {
                        cb(null, rows);
                    }
                })
                .catch(err => {
                    if (typeof cb === "function") {
                        cb(err, []);
                    } else {
                        console.error("Turso all error:", err.message);
                    }
                });
            return this;
        }

        exec(sql, cb) {
            this.client.executeMultiple(sql)
                .then(() => {
                    if (typeof cb === "function") cb(null);
                })
                .catch(err => {
                    if (typeof cb === "function") cb(err);
                });
            return this;
        }

        close(cb) {
            if (this.client && typeof this.client.close === "function") {
                this.client.close();
            }
            if (typeof cb === "function") cb(null);
        }
    }

    db = new TursoSqliteAdapter(client);
} else {
    // Chế độ dự phòng: SQLite3 cục bộ (Local Development)
    console.log("💾 [Database] Sử dụng SQLite3 cục bộ (reward.db)...");
    const sqlite3 = require("sqlite3").verbose();
    const dbDir = process.env.VERCEL ? "/tmp" : __dirname;
    const dbPath = path.resolve(dbDir, "reward.db");
    db = new sqlite3.Database(dbPath);
}

// ========================================================
// Khởi tạo các bảng & Nạp tài khoản dữ liệu mẫu
// Tương thích 100% với cả Turso Cloud và SQLite3 cục bộ
// ========================================================
function initTablesAndSeed(database) {
    database.serialize(() => {
        // 1. Rewards Table (Bản ghi khen thưởng on-chain)
        database.run(`
            CREATE TABLE IF NOT EXISTS rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student TEXT NOT NULL,
                amount INTEGER NOT NULL,
                reason TEXT,
                transactionHash TEXT,
                evidence_name TEXT,
                evidence_hash TEXT,
                evidence_data TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Students Table (Hồ sơ sinh viên)
        database.run(`
            CREATE TABLE IF NOT EXISTS students (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                studentId TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                wallet TEXT UNIQUE NOT NULL,
                email TEXT
            )
        `);

        // 3. Users Table (Tài khoản người dùng đăng nhập)
        database.run(`
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

        // 4. Proposals Table (Đề xuất khen thưởng của Giảng viên)
        database.run(`
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
                evidence_name TEXT,
                evidence_hash TEXT,
                evidence_data TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 5. Teacher Whitelist Table (Danh sách giảng viên SSO)
        database.run(`
            CREATE TABLE IF NOT EXISTS teacher_whitelist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                department TEXT DEFAULT 'Khoa Công nghệ Thông tin',
                role TEXT DEFAULT 'TEACHER',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 6. Safe Column Migration
        database.run(`ALTER TABLE users ADD COLUMN name TEXT`, () => {});
        database.run(`ALTER TABLE proposals ADD COLUMN evidence_name TEXT`, () => {});
        database.run(`ALTER TABLE proposals ADD COLUMN evidence_hash TEXT`, () => {});
        database.run(`ALTER TABLE proposals ADD COLUMN evidence_data TEXT`, () => {});
        database.run(`ALTER TABLE rewards ADD COLUMN evidence_name TEXT`, () => {});
        database.run(`ALTER TABLE rewards ADD COLUMN evidence_hash TEXT`, () => {});
        database.run(`ALTER TABLE rewards ADD COLUMN evidence_data TEXT`, () => {});

        // 7. Seed Whitelist Teachers
        database.run(`
            INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
            VALUES ('nvthanh@ictu.edu.vn', 'TS. Nguyễn Văn Thành', 'Khoa Công nghệ Thông tin', 'TEACHER')
        `);
        database.run(`
            INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
            VALUES ('teacher@ictu.edu.vn', 'TS. Nguyễn Văn Thành', 'Khoa Công nghệ Thông tin', 'TEACHER')
        `);
        database.run(`
            INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
            VALUES ('ptthao@ictu.edu.vn', 'ThS. Phan Thị Thảo', 'Khoa Khoa học Máy tính', 'TEACHER')
        `);
        database.run(`
            INSERT OR IGNORE INTO teacher_whitelist (email, name, department, role)
            VALUES ('admin@ictu.edu.vn', 'Ban Quản trị Trường ICTU', 'Phòng Đào tạo & NCKH', 'ADMIN')
        `);

        // 8. Seed Default Accounts
        database.run(`UPDATE users SET password = '123456' WHERE password = 'SSO_AUTHORIZED'`);

        // ADMIN ACCOUNTS
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('admin', '123456', 'ADMIN', NULL, 'Ban Quản trị Trường ICTU')
        `);
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('admin@ictu.edu.vn', '123456', 'ADMIN', NULL, 'Ban Quản trị Trường ICTU')
        `);

        // TEACHER ACCOUNTS (Email @ictu.edu.vn)
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('nvthanh@ictu.edu.vn', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
        `);
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('ptthao@ictu.edu.vn', '123456', 'TEACHER', NULL, 'ThS. Phan Thị Thảo - Khoa KHMT')
        `);
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('teacher@ictu.edu.vn', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
        `);
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('teacher', '123456', 'TEACHER', NULL, 'TS. Nguyễn Văn Thành - Khoa CNTT')
        `);

        // STUDENT 1: Pham Minh Hoa (Mã SV: DTC235180075)
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('dtc235180075', 'ictu@123456', 'STUDENT', 'DTC235180075', 'Phạm Minh Hòa')
        `);
        database.run(`
            INSERT OR IGNORE INTO students (studentId, name, wallet, email)
            VALUES ('DTC235180075', 'Phạm Minh Hòa', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'dtc235180075@ictu.edu.vn')
        `);

        // STUDENT 2: Tran Van Nam (Mã SV: DTC235180076)
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('dtc235180076', 'ictu@123456', 'STUDENT', 'DTC235180076', 'Trần Văn Nam')
        `);
        database.run(`
            INSERT OR IGNORE INTO students (studentId, name, wallet, email)
            VALUES ('DTC235180076', 'Trần Văn Nam', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'dtc235180076@ictu.edu.vn')
        `);

        // STUDENT 3: Nguyen Thi Lan (Mã SV: DTC235180077)
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('dtc235180077', 'ictu@123456', 'STUDENT', 'DTC235180077', 'Nguyễn Thị Lan')
        `);
        database.run(`
            INSERT OR IGNORE INTO students (studentId, name, wallet, email)
            VALUES ('DTC235180077', 'Nguyễn Thị Lan', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'dtc235180077@ictu.edu.vn')
        `);

        // 9. Legacy compatibility seeds
        database.run(`
            INSERT OR IGNORE INTO users (username, password, role, studentId, name)
            VALUES ('hoa', '123456', 'STUDENT', 'DTC001', 'Phạm Minh Hòa')
        `);
        database.run(`
            INSERT OR IGNORE INTO students (studentId, name, wallet, email)
            VALUES ('DTC001', 'Phạm Minh Hòa', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'hoa@ictu.edu.vn')
        `);
    });
}

initTablesAndSeed(db);

module.exports = db;
