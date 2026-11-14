const express = require("express");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");

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
// Google Sign-In / SSO Authentication
// Nhận access_token (OAuth 2.0 UserInfo) hoặc credential (ID Token) từ Google Identity Services
// ========================
router.post("/google", async (req, res) => {
    try {
        const { access_token, credential, email: directEmail, name: directName } = req.body;

        let email = "";
        let fullName = "";

        // 1. Xác thực qua Google OAuth 2.0 API chính thức
        if (access_token) {
            try {
                const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
                    headers: { Authorization: `Bearer ${access_token}` }
                });

                if (!userinfoRes.ok) {
                    const errText = await userinfoRes.text();
                    console.error("Google userinfo failed:", userinfoRes.status, errText);
                    return res.status(401).json({
                        error: "Mã xác thực Google Access Token không hợp lệ hoặc đã hết hạn."
                    });
                }

                const payload = await userinfoRes.json();
                email = payload.email ? String(payload.email).trim().toLowerCase() : "";
                fullName = payload.name || payload.given_name || (email ? email.split("@")[0] : "");
            } catch (aErr) {
                console.error("Google userinfo fetch error:", aErr);
                return res.status(500).json({
                    error: "Không thể kết nối đến máy chủ Google để xác thực Access Token: " + aErr.message
                });
            }
        } else if (credential) {
            try {
                const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
                if (!googleRes.ok) {
                    return res.status(401).json({
                        error: "Mã xác thực Google ID Token không hợp lệ hoặc đã hết hạn."
                    });
                }
                const payload = await googleRes.json();
                email = payload.email ? String(payload.email).trim().toLowerCase() : "";
                fullName = payload.name || payload.given_name || (email ? email.split("@")[0] : "");
            } catch (gErr) {
                console.error("Google verify token error:", gErr);
                return res.status(500).json({
                    error: "Không thể kết nối đến máy chủ Google để xác thực ID Token: " + gErr.message
                });
            }
        } else if (directEmail) {
            // Chế độ demo / direct email
            email = String(directEmail).trim().toLowerCase();
            fullName = directName || email.split("@")[0];
        }

        if (!email) {
            return res.status(400).json({
                error: "Không nhận được địa chỉ email từ tài khoản Google"
            });
        }

        // 2. PHÂN LOẠI & XÁC THỰC THEO EMAIL:

        // A. Kiểm tra tài khoản Giảng viên / Quản trị viên
        db.get(
            `SELECT * FROM users WHERE LOWER(username) = LOWER(?)`,
            [email],
            (userErr, existingUser) => {
                if (userErr) {
                    return res.status(500).json({ error: userErr.message });
                }

                // Nếu tài khoản đã tồn tại với quyền ADMIN hoặc TEACHER
                if (existingUser && (existingUser.role === "ADMIN" || existingUser.role === "TEACHER")) {
                    const token = jwt.sign(
                        {
                            id: existingUser.id,
                            username: existingUser.username,
                            role: existingUser.role,
                            studentId: null,
                            name: existingUser.name || fullName
                        },
                        SECRET,
                        { expiresIn: "8h" }
                    );

                    return res.json({
                        success: true,
                        message: "Google login success",
                        role: existingUser.role,
                        username: existingUser.username,
                        name: existingUser.name || fullName,
                        teacherName: existingUser.name || fullName,
                        token: token
                    });
                }

                // Kiểm tra trong danh sách trắng Giảng viên (teacher_whitelist)
                db.get(
                    `SELECT * FROM teacher_whitelist WHERE LOWER(email) = LOWER(?)`,
                    [email],
                    (wlErr, whitelisted) => {
                        if (wlErr) {
                            return res.status(500).json({ error: wlErr.message });
                        }

                        if (whitelisted) {
                            const role = whitelisted.role || "TEACHER";
                            const displayName = whitelisted.name || fullName;

                            return db.run(
                                `INSERT OR IGNORE INTO users (username, password, role, name) VALUES (?, 'SSO_GOOGLE', ?, ?)`,
                                [email, role, displayName],
                                function() {
                                    db.get(
                                        `SELECT id FROM users WHERE LOWER(username) = LOWER(?)`,
                                        [email],
                                        (getErr, uRow) => {
                                            const token = jwt.sign(
                                                { id: uRow ? uRow.id : 0, username: email, role, studentId: null, name: displayName },
                                                SECRET,
                                                { expiresIn: "8h" }
                                            );

                                            return res.json({
                                                success: true,
                                                message: "Google login success",
                                                role,
                                                username: email,
                                                name: displayName,
                                                teacherName: displayName,
                                                token
                                            });
                                        }
                                    );
                                }
                            );
                        }

                        // B. Kiểm tra tên miền Email trường ICTU:
                        // Bắt buộc phải là email do trường cấp (@ictu.edu.vn hoặc @ms.ictu.edu.vn)
                        const isIctuDomain = email.endsWith("@ictu.edu.vn") || email.endsWith("@ms.ictu.edu.vn");
                        if (!isIctuDomain) {
                            return res.status(403).json({
                                error: "Vui lòng chọn tài khoản Email do trường ICTU cấp (@ictu.edu.vn) để đăng nhập!"
                            });
                        }

                        // C. Đối tượng Sinh viên ICTU
                        let extractedId = email.split("@")[0].toUpperCase();
                        if (extractedId.includes(".")) {
                            extractedId = extractedId.split(".")[0].toUpperCase();
                        }

                        db.get(
                            `SELECT * FROM students WHERE LOWER(studentId) = LOWER(?) OR (email IS NOT NULL AND LOWER(email) = LOWER(?))`,
                            [extractedId, email],
                            (sErr, student) => {
                                if (sErr) {
                                    return res.status(500).json({ error: sErr.message });
                                }

                                if (student) {
                                    const sId = student.studentId;
                                    const sName = student.name || fullName;
                                    const sWallet = student.wallet;

                                    db.run(
                                        `INSERT OR IGNORE INTO users (username, password, role, studentId, name) VALUES (?, 'SSO_GOOGLE', 'STUDENT', ?, ?)`,
                                        [email, sId, sName],
                                        () => {
                                            const token = jwt.sign(
                                                { username: email, role: "STUDENT", studentId: sId, name: sName },
                                                SECRET,
                                                { expiresIn: "8h" }
                                            );

                                            return res.json({
                                                success: true,
                                                message: "Google student login success",
                                                role: "STUDENT",
                                                username: email,
                                                studentId: sId,
                                                studentName: sName,
                                                name: sName,
                                                wallet: sWallet,
                                                token
                                            });
                                        }
                                    );
                                } else {
                                    // Sinh viên ICTU mới lần đầu đăng nhập:
                                    // Tự động khởi tạo hồ sơ kèm địa chỉ ví EVM tất định từ keccak256(email)
                                    const hash = ethers.keccak256(ethers.toUtf8Bytes(email));
                                    const newWallet = ethers.getAddress("0x" + hash.slice(-40));
                                    const sId = extractedId;
                                    const sName = fullName || `Sinh viên ${sId}`;

                                    db.run(
                                        `INSERT OR IGNORE INTO students (studentId, name, wallet, email) VALUES (?, ?, ?, ?)`,
                                        [sId, sName, newWallet, email],
                                        function() {
                                            db.run(
                                                `INSERT OR IGNORE INTO users (username, password, role, studentId, name) VALUES (?, 'SSO_GOOGLE', 'STUDENT', ?, ?)`,
                                                [email, sId, sName],
                                                function() {
                                                    const token = jwt.sign(
                                                        { username: email, role: "STUDENT", studentId: sId, name: sName },
                                                        SECRET,
                                                        { expiresIn: "8h" }
                                                    );

                                                    return res.json({
                                                        success: true,
                                                        message: "Google student auto-provisioned success",
                                                        role: "STUDENT",
                                                        username: email,
                                                        studentId: sId,
                                                        studentName: sName,
                                                        name: sName,
                                                        wallet: newWallet,
                                                        token
                                                    });
                                                }
                                            );
                                        }
                                    );
                                }
                            }
                        );
                    }
                );
            }
        );
    } catch (err) {
        console.error("Auth google route error:", err);
        return res.status(500).json({ error: "Lỗi xử lý xác thực Google: " + err.message });
    }
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