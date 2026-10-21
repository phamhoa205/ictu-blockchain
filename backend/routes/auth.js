const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const db = require("../database/database");
const { SECRET, verifyToken } = require("../middleware/auth");

// ========================
// Login
// ========================
router.post("/login", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            error: "Username and password are required"
        });
    }

    const cleanUsername = String(username).trim();

    db.get(
        `SELECT * FROM users WHERE username = ?`,
        [cleanUsername],
        (err, user) => {
            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (!user) {
                return res.status(401).json({
                    error: "Invalid username or password"
                });
            }

            // Verify password: support bcrypt hash or plain text fallback
            let passwordMatches = false;
            try {
                if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
                    passwordMatches = bcrypt.compareSync(password, user.password);
                }
            } catch (e) {
                passwordMatches = false;
            }

            if (!passwordMatches && user.password === password) {
                passwordMatches = true;
            }

            if (!passwordMatches) {
                return res.status(401).json({
                    error: "Invalid username or password"
                });
            }

            // Generate JWT
            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    studentId: user.studentId
                },
                SECRET,
                {
                    expiresIn: "8h"
                }
            );

            // If student, also fetch student profile details
            if (user.role === "STUDENT" && user.studentId) {
                db.get(
                    `SELECT name, wallet, email FROM students WHERE studentId = ?`,
                    [user.studentId],
                    (studentErr, student) => {
                        return res.json({
                            message: "Login success",
                            username: user.username,
                            role: user.role,
                            studentId: user.studentId,
                            studentName: student ? student.name : user.username,
                            wallet: student ? student.wallet : null,
                            token: token
                        });
                    }
                );
            } else {
                return res.json({
                    message: "Login success",
                    username: user.username,
                    role: user.role,
                    studentId: user.studentId,
                    token: token
                });
            }
        }
    );
});

// ========================
// Get Current User Profile
// ========================
router.get("/me", verifyToken, (req, res) => {
    db.get(
        `SELECT id, username, role, studentId, createdAt FROM users WHERE username = ?`,
        [req.user.username],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            if (user.role === "STUDENT" && user.studentId) {
                db.get(
                    `SELECT name, wallet, email FROM students WHERE studentId = ?`,
                    [user.studentId],
                    (sErr, student) => {
                        return res.json({
                            ...user,
                            studentDetails: student || null
                        });
                    }
                );
            } else {
                return res.json(user);
            }
        }
    );
});

module.exports = router;