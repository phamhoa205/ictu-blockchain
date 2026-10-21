const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.resolve(__dirname, "reward.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // ==========================
    // Rewards Table
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
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ==========================
    // Seed Default Accounts
    // ==========================

    // 1. ADMIN ACCOUNT
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId)
        VALUES ('admin', '123456', 'ADMIN', NULL)
    `);

    // 2. STUDENT 1: Pham Minh Hoa (Hardhat Account #1)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId)
        VALUES ('hoa', '123456', 'STUDENT', 'DTC001')
    `);

    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC001', 'Pham Minh Hoa', '0x70997970C51812dc3A010C7d01b50e0dce2c79c8', 'hoa@ictu.edu.vn')
    `);

    // 3. STUDENT 2: Tran Van Nam (Hardhat Account #2)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId)
        VALUES ('nam', '123456', 'STUDENT', 'DTC002')
    `);

    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC002', 'Tran Van Nam', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'nam@ictu.edu.vn')
    `);

    // 4. STUDENT 3: Nguyen Thi Lan (Hardhat Account #3)
    db.run(`
        INSERT OR IGNORE INTO users (username, password, role, studentId)
        VALUES ('lan', '123456', 'STUDENT', 'DTC003')
    `);

    db.run(`
        INSERT OR IGNORE INTO students (studentId, name, wallet, email)
        VALUES ('DTC003', 'Nguyen Thi Lan', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'lan@ictu.edu.vn')
    `);
});

module.exports = db;