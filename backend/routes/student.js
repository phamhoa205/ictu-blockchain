const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const bcrypt = require("bcrypt");

const db = require("../database/database");
const { verifyToken, isAdmin, isTeacherOrAdmin, isStudent } = require("../middleware/auth");

// =====================================
// Add Student
// ADMIN ONLY
// Automatically provisions student login
// =====================================
router.post("/", verifyToken, isAdmin, (req, res) => {
    const { studentId, name, wallet, email, password } = req.body;

    if (!studentId || !name || !wallet) {
        return res.status(400).json({
            error: "Missing required information: studentId, name, and wallet are required"
        });
    }

    const cleanId = String(studentId).trim();
    const cleanName = String(name).trim();
    const cleanWallet = String(wallet).trim();
    const cleanEmail = email ? String(email).trim() : null;

    // Validate EVM wallet address format
    if (!ethers.isAddress(cleanWallet)) {
        return res.status(400).json({
            error: "Invalid Ethereum wallet address format (e.g. 0x... 40 hex chars)"
        });
    }

    // Check for duplicate studentId or wallet
    db.get(
        `SELECT studentId, wallet FROM students WHERE LOWER(studentId) = LOWER(?) OR LOWER(wallet) = LOWER(?)`,
        [cleanId, cleanWallet],
        (checkErr, existing) => {
            if (checkErr) {
                return res.status(500).json({ error: checkErr.message });
            }
            if (existing) {
                if (existing.studentId.toLowerCase() === cleanId.toLowerCase()) {
                    return res.status(409).json({ error: `Student ID '${cleanId}' already exists` });
                }
                return res.status(409).json({ error: `Wallet address is already registered to another student` });
            }

            // Insert into students table
            db.run(
                `INSERT INTO students (studentId, name, wallet, email) VALUES (?, ?, ?, ?)`,
                [cleanId, cleanName, cleanWallet, cleanEmail],
                function (insertErr) {
                    if (insertErr) {
                        return res.status(500).json({ error: insertErr.message });
                    }

                    const newStudentRowId = this.lastID;

                    // Automatically create user login account for this student
                    const username = cleanId.toLowerCase();
                    const rawPassword = password || "ictu@123456";
                    const salt = bcrypt.genSaltSync(10);
                    const hashedPassword = bcrypt.hashSync(rawPassword, salt);

                    db.run(
                        `INSERT OR IGNORE INTO users (username, password, role, studentId, name) VALUES (?, ?, 'STUDENT', ?, ?)`,
                        [username, hashedPassword, cleanId, cleanName],
                        (userErr) => {
                            if (userErr) {
                                console.error("Warning: Failed to create user login for student:", userErr.message);
                            }

                            res.status(201).json({
                                message: "Student registered successfully",
                                id: newStudentRowId,
                                student: {
                                    studentId: cleanId,
                                    name: cleanName,
                                    wallet: cleanWallet,
                                    email: cleanEmail,
                                    username: username,
                                    defaultPassword: password ? "(Custom)" : "ictu@123456"
                                }
                            });
                        }
                    );
                }
            );
        }
    );
});

// =====================================
// Student Statistics
// ADMIN ONLY
// =====================================
router.get("/stats", verifyToken, isAdmin, (req, res) => {
    db.get(
        `SELECT 
            COUNT(DISTINCT s.id) AS totalStudents,
            COUNT(DISTINCT r.student) AS rewardedStudents
         FROM students s
         LEFT JOIN rewards r ON LOWER(s.wallet) = LOWER(r.student)`,
        [],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                totalStudents: row ? row.totalStudents : 0,
                rewardedStudents: row ? row.rewardedStudents : 0
            });
        }
    );
});

// =====================================
// Get All Students with Optional Search & Pagination
// ADMIN & TEACHER
// =====================================
router.get("/", verifyToken, isTeacherOrAdmin, (req, res) => {
    const search = req.query.search ? String(req.query.search).trim() : null;
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);

    let baseSql = `SELECT s.*, 
        COALESCE(SUM(r.amount), 0) AS totalEarned,
        COUNT(r.id) AS rewardCount
        FROM students s
        LEFT JOIN rewards r ON LOWER(s.wallet) = LOWER(r.student)`;
    let countSql = `SELECT COUNT(*) AS total FROM students s`;
    let params = [];

    if (search) {
        const pattern = `%${search}%`;
        const filter = ` WHERE s.studentId LIKE ? OR s.name LIKE ? OR s.wallet LIKE ? OR s.email LIKE ?`;
        baseSql += filter;
        countSql += filter;
        params = [pattern, pattern, pattern, pattern];
    }

    baseSql += ` GROUP BY s.id ORDER BY s.id DESC`;

    if (page && limit && page > 0 && limit > 0) {
        const offset = (page - 1) * limit;
        db.get(countSql, params, (countErr, countRow) => {
            if (countErr) {
                return res.status(500).json({ error: countErr.message });
            }

            db.all(
                `${baseSql} LIMIT ? OFFSET ?`,
                [...params, limit, offset],
                (err, rows) => {
                    if (err) {
                        return res.status(500).json({ error: err.message });
                    }
                    res.json({
                        page,
                        limit,
                        total: countRow ? countRow.total : 0,
                        data: rows
                    });
                }
            );
        });
    } else {
        db.all(baseSql, params, (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows);
        });
    }
});

// =====================================
// Student Profile (Current Logged-in Student)
// STUDENT ONLY
// =====================================
router.get("/profile", verifyToken, isStudent, (req, res) => {
    const studentId = req.user.studentId;

    db.get(
        `SELECT s.*, 
            COALESCE(SUM(r.amount), 0) AS totalEarned,
            COUNT(r.id) AS rewardCount
         FROM students s
         LEFT JOIN rewards r ON LOWER(s.wallet) = LOWER(r.student)
         WHERE s.studentId = ?
         GROUP BY s.id`,
        [studentId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                return res.status(404).json({ error: "Student profile not found" });
            }
            res.json(row);
        }
    );
});

// =====================================
// Get Student By ID
// ADMIN & TEACHER
// =====================================
router.get("/:studentId", verifyToken, isTeacherOrAdmin, (req, res) => {
    const studentId = req.params.studentId;

    db.get(
        `SELECT s.*, 
            COALESCE(SUM(r.amount), 0) AS totalEarned,
            COUNT(r.id) AS rewardCount
         FROM students s
         LEFT JOIN rewards r ON LOWER(s.wallet) = LOWER(r.student)
         WHERE s.studentId = ?
         GROUP BY s.id`,
        [studentId],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!row) {
                return res.status(404).json({ error: "Student not found" });
            }
            res.json(row);
        }
    );
});

// =====================================
// Update Student
// ADMIN ONLY
// =====================================
router.put("/:studentId", verifyToken, isAdmin, (req, res) => {
    const studentId = req.params.studentId;
    const { name, wallet, email } = req.body;

    if (!name || !wallet) {
        return res.status(400).json({
            error: "Name and wallet are required for update"
        });
    }

    const cleanWallet = String(wallet).trim();
    if (!ethers.isAddress(cleanWallet)) {
        return res.status(400).json({
            error: "Invalid Ethereum wallet address format"
        });
    }

    db.run(
        `UPDATE students SET name = ?, wallet = ?, email = ? WHERE studentId = ?`,
        [String(name).trim(), cleanWallet, email ? String(email).trim() : null, studentId],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ error: "Student not found" });
            }

            res.json({
                message: "Student updated successfully",
                studentId
            });
        }
    );
});

// =====================================
// Delete Student
// ADMIN ONLY
// =====================================
router.delete("/:studentId", verifyToken, isAdmin, (req, res) => {
    const studentId = req.params.studentId;

    db.get(
        `SELECT wallet FROM students WHERE studentId = ?`,
        [studentId],
        (err, student) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!student) {
                return res.status(404).json({ error: "Student not found" });
            }

            // Remove rewards, user account, then student record
            db.serialize(() => {
                db.run(
                    `DELETE FROM rewards WHERE LOWER(student) = LOWER(?)`,
                    [student.wallet]
                );

                db.run(
                    `DELETE FROM users WHERE studentId = ?`,
                    [studentId]
                );

                db.run(
                    `DELETE FROM students WHERE studentId = ?`,
                    [studentId],
                    function (delErr) {
                        if (delErr) {
                            return res.status(500).json({ error: delErr.message });
                        }
                        res.json({
                            message: `Student '${studentId}' and related records deleted successfully`
                        });
                    }
                );
            });
        }
    );
});

module.exports = router;