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
            error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu"
        });
    }

    const cleanUsername = String(username).trim();

    // Case-insensitive lookup by username OR studentId (e.g. dtc235180075 or DTC235180075)
    db.get(
        `SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR (studentId IS NOT NULL AND LOWER(studentId) = LOWER(?))`,
        [cleanUsername, cleanUsername],
        (err, user) => {
            if (err) {
                return res.status(500).json({
                    error: err.message
                });
            }

            if (!user) {
                // If not in users, check if it's an @ictu.edu.vn email in teacher_whitelist
                if (cleanUsername.toLowerCase().endsWith("@ictu.edu.vn")) {
                    return db.get(
                        `SELECT * FROM teacher_whitelist WHERE LOWER(email) = LOWER(?)`,
                        [cleanUsername],
                        (wlErr, whitelisted) => {
                            if (whitelisted && (password === "123456" || password === "ictu@123456")) {
                                const role = whitelisted.role || "TEACHER";
                                const displayName = whitelisted.name || cleanUsername;
                                return db.run(
                                    `INSERT INTO users (username, password, role, name) VALUES (?, '123456', ?, ?)`,
                                    [cleanUsername, role, displayName],
                                    function(insErr) {
                                        if (insErr) return res.status(500).json({ error: insErr.message });
                                        const token = jwt.sign(
                                            { id: this.lastID, username: cleanUsername, role: role, name: displayName },
                                            SECRET,
                                            { expiresIn: "8h" }
                                        );
                                        return res.json({
                                            message: "Login success",
                                            username: cleanUsername,
                                            role: role,
                                            name: displayName,
                                            teacherName: displayName,
                                            token: token
                                        });
                                    }
                                );
                            }

                            return res.status(401).json({
                                error: "Tài khoản hoặc mật khẩu không chính xác"
                            });
                        }
                    );
                }

                return res.status(401).json({
                    error: "Tài khoản hoặc mật khẩu không chính xác"
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

            // Allow default password for school accounts or SSO-authorized records
            if (!passwordMatches && (password === "123456" || password === "ictu@123456")) {
                if (user.password === "SSO_AUTHORIZED" || user.role === "TEACHER" || user.username.includes("@ictu.edu.vn")) {
                    passwordMatches = true;
                }
            }

            if (!passwordMatches) {
                return res.status(401).json({
                    error: "Tài khoản hoặc mật khẩu không chính xác"
                });
            }

            // Generate JWT
            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    studentId: user.studentId,
                    name: user.name || user.username
                },
                SECRET,
                {
                    expiresIn: "8h"
                }
            );

            // If student, also fetch student profile details
            if (user.role === "STUDENT" && user.studentId) {
                db.get(
                    `SELECT name, wallet, email FROM students WHERE LOWER(studentId) = LOWER(?)`,
                    [user.studentId],
                    (studentErr, student) => {
                        return res.json({
                            message: "Login success",
                            username: user.username,
                            role: user.role,
                            studentId: user.studentId,
                            studentName: student ? student.name : (user.name || user.username),
                            name: student ? student.name : (user.name || user.username),
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
                    name: user.name || (user.role === "ADMIN" ? "Ban Quản trị ICTU" : "Giảng viên"),
                    teacherName: user.name || "Giảng viên",
                    token: token
                });
            }
        }
    );
});

// ========================
// Change Password
// Available to any authenticated user (Student, Teacher, Admin)
// ========================
router.post("/change-password", verifyToken, (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({
            error: "Vui lòng nhập mật khẩu hiện tại và mật khẩu mới"
        });
    }

    if (String(newPassword).length < 6) {
        return res.status(400).json({
            error: "Mật khẩu mới phải có ít nhất 6 ký tự"
        });
    }

    db.get(
        `SELECT * FROM users WHERE id = ?`,
        [req.user.id],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                return res.status(404).json({ error: "Không tìm thấy thông tin tài khoản" });
            }

            // Verify old password
            let matches = false;
            try {
                if (user.password.startsWith("$2a$") || user.password.startsWith("$2b$")) {
                    matches = bcrypt.compareSync(oldPassword, user.password);
                }
            } catch (e) {
                matches = false;
            }

            if (!matches && user.password === oldPassword) {
                matches = true;
            }

            if (!matches) {
                return res.status(400).json({
                    error: "Mật khẩu hiện tại không đúng"
                });
            }

            // Hash new password and save
            const salt = bcrypt.genSaltSync(10);
            const hashedPassword = bcrypt.hashSync(String(newPassword), salt);

            db.run(
                `UPDATE users SET password = ? WHERE id = ?`,
                [hashedPassword, user.id],
                function (updateErr) {
                    if (updateErr) {
                        return res.status(500).json({ error: updateErr.message });
                    }
                    return res.json({
                        success: true,
                        message: "Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới."
                    });
                }
            );
        }
    );
});

// ========================
// ========================
// Get Current User Profile
// ========================
router.get("/me", verifyToken, (req, res) => {
    db.get(
        `SELECT id, username, role, studentId, name, createdAt FROM users WHERE id = ?`,
        [req.user.id],
        (err, user) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            if (user.role === "STUDENT" && user.studentId) {
                db.get(
                    `SELECT name, wallet, email FROM students WHERE LOWER(studentId) = LOWER(?)`,
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

// ========================
// Single Sign-On (SSO) Login with School Email (@ictu.edu.vn)
// No password required in local database - verified via Whitelist
// ========================
router.post("/sso-login", (req, res) => {
    const { email, name, provider } = req.body;

    if (!email) {
        return res.status(400).json({
            error: "Vui lòng cung cấp địa chỉ email trường"
        });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // 1. Verify Domain: Must end with @ictu.edu.vn
    if (!cleanEmail.endsWith("@ictu.edu.vn")) {
        return res.status(400).json({
            error: "Tài khoản không hợp lệ. Hệ thống chỉ chấp nhận email trường có đuôi '@ictu.edu.vn'!"
        });
    }

    // 2. Verify Whitelist in database
    db.get(
        `SELECT * FROM teacher_whitelist WHERE LOWER(email) = LOWER(?)`,
        [cleanEmail],
        (err, whitelisted) => {
            if (err) {
                return res.status(500).json({ error: "Lỗi kiểm tra danh sách cấp quyền: " + err.message });
            }

            if (!whitelisted) {
                return res.status(403).json({
                    error: `Email '${cleanEmail}' chưa được Ban Quản trị cấp quyền truy cập. Vui lòng liên hệ Admin để thêm vào Danh sách trắng (Whitelist).`
                });
            }

            // 3. Find or auto-provision local user profile (without password)
            const role = whitelisted.role || "TEACHER";
            const displayName = whitelisted.name || name || cleanEmail.split("@")[0];

            db.get(
                `SELECT * FROM users WHERE LOWER(username) = LOWER(?)`,
                [cleanEmail],
                (uErr, existingUser) => {
                    if (uErr) {
                        return res.status(500).json({ error: uErr.message });
                    }

                    if (!existingUser) {
                        // Create user record without password (marked as SSO)
                        db.run(
                            `INSERT INTO users (username, password, role, name) VALUES (?, 'SSO_AUTHORIZED', ?, ?)`,
                            [cleanEmail, role, displayName],
                            function (insErr) {
                                if (insErr) {
                                    return res.status(500).json({ error: insErr.message });
                                }

                                const token = jwt.sign(
                                    {
                                        id: this.lastID,
                                        username: cleanEmail,
                                        role: role,
                                        name: displayName,
                                        email: cleanEmail,
                                        authMethod: "SSO_ICTU"
                                    },
                                    SECRET,
                                    { expiresIn: "8h" }
                                );

                                return res.json({
                                    success: true,
                                    message: `Đăng nhập Single Sign-On thành công (${provider || "ICTU SSO"})`,
                                    username: cleanEmail,
                                    name: displayName,
                                    role: role,
                                    email: cleanEmail,
                                    department: whitelisted.department,
                                    token: token
                                });
                            }
                        );
                    } else {
                        // User exists, issue JWT
                        const token = jwt.sign(
                            {
                                id: existingUser.id,
                                username: existingUser.username,
                                role: existingUser.role || role,
                                name: existingUser.name || displayName,
                                email: cleanEmail,
                                authMethod: "SSO_ICTU"
                            },
                            SECRET,
                            { expiresIn: "8h" }
                        );

                        return res.json({
                            success: true,
                            message: `Đăng nhập Single Sign-On thành công (${provider || "ICTU SSO"})`,
                            username: existingUser.username,
                            name: existingUser.name || displayName,
                            role: existingUser.role || role,
                            email: cleanEmail,
                            department: whitelisted.department,
                            token: token
                        });
                    }
                }
            );
        }
    );
});

// ========================
// Whitelist Management Endpoints
// ========================

// GET Whitelist (ADMIN only or for SSO suggestion)
router.get("/whitelist", (req, res) => {
    db.all(`SELECT id, email, name, department, role, createdAt FROM teacher_whitelist ORDER BY id ASC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows || []);
    });
});

// POST Add to Whitelist (ADMIN only)
router.post("/whitelist", verifyToken, (req, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Chỉ Ban Quản trị (Admin) mới có quyền cấp Whitelist" });
    }

    const { email, name, department, role } = req.body;

    if (!email || !name) {
        return res.status(400).json({ error: "Email và Tên giảng viên là bắt buộc" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail.endsWith("@ictu.edu.vn")) {
        return res.status(400).json({ error: "Email phải có đuôi trường '@ictu.edu.vn'" });
    }

    db.run(
        `INSERT INTO teacher_whitelist (email, name, department, role) VALUES (?, ?, ?, ?)`,
        [cleanEmail, String(name).trim(), department ? String(department).trim() : "Khoa Công nghệ Thông tin", role || "TEACHER"],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(409).json({ error: `Email '${cleanEmail}' đã có trong danh sách Whitelist từ trước` });
                }
                return res.status(500).json({ error: err.message });
            }

            res.status(201).json({
                success: true,
                message: `Đã cấp quyền Whitelist cho cán bộ: ${name} (${cleanEmail})`,
                id: this.lastID
            });
        }
    );
});

// DELETE Remove from Whitelist (ADMIN only)
router.delete("/whitelist/:id", verifyToken, (req, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ error: "Chỉ Ban Quản trị mới có quyền xóa Whitelist" });
    }

    db.run(`DELETE FROM teacher_whitelist WHERE id = ?`, [req.params.id], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ success: true, message: "Đã thu hồi quyền Whitelist" });
    });
});

module.exports = router;