const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");

const db = require("../database/database");
const {
    managerContract,
    tokenContract,
    rewardTokenAddress,
    rewardManagerAddress,
    checkConnection
} = require("../services/blockchain");

const { verifyToken, isAdmin, isTeacher, isTeacherOrAdmin, isStudent } = require("../middleware/auth");

// =====================================
// Issue Reward
// ADMIN ONLY
// =====================================
router.post("/issue", verifyToken, isAdmin, async (req, res) => {
    try {
        const { studentId, amount, reason } = req.body;

        if (!studentId || amount === undefined || amount === null) {
            return res.status(400).json({
                error: "Missing required fields: studentId and amount are required"
            });
        }

        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
            return res.status(400).json({
                error: "Reward amount must be a positive integer"
            });
        }

        const cleanId = String(studentId).trim();
        const cleanReason = reason ? String(reason).trim() : "Academic Reward";

        // Lookup student in SQLite (case-insensitive)
        db.get(
            `SELECT * FROM students WHERE LOWER(studentId) = LOWER(?) OR LOWER(wallet) = LOWER(?)`,
            [cleanId, cleanId],
            async (err, student) => {
                if (err) {
                    return res.status(500).json({
                        error: "Database error: " + err.message
                    });
                }

                if (!student) {
                    return res.status(404).json({
                        error: `Student not found with ID/Wallet: '${cleanId}'`
                    });
                }

                if (!ethers.isAddress(student.wallet)) {
                    return res.status(400).json({
                        error: `Student wallet '${student.wallet}' is not a valid EVM address`
                    });
                }

                try {
                    const targetWallet = ethers.getAddress(student.wallet.trim().toLowerCase());

                    // Send transaction to smart contract on blockchain
                    const tx = await managerContract.issueReward(
                        targetWallet,
                        numAmount,
                        cleanReason
                    );

                    // Wait for transaction confirmation
                    const receipt = await tx.wait();

                    // Record transaction in SQLite database
                    db.run(
                        `INSERT INTO rewards (student, amount, reason, transactionHash) VALUES (?, ?, ?, ?)`,
                        [student.wallet, numAmount, cleanReason, tx.hash],
                        function (dbInsertErr) {
                            if (dbInsertErr) {
                                console.error("Database insert warning:", dbInsertErr.message);
                            }

                            return res.status(200).json({
                                success: true,
                                message: "Reward issued successfully on blockchain",
                                rewardId: this ? this.lastID : null,
                                studentId: student.studentId,
                                name: student.name,
                                wallet: student.wallet,
                                amount: numAmount,
                                reason: cleanReason,
                                transaction: tx.hash,
                                blockNumber: receipt.blockNumber,
                                gasUsed: receipt.gasUsed ? receipt.gasUsed.toString() : null
                            });
                        }
                    );
                } catch (txError) {
                    console.error("Blockchain transaction error:", txError);
                    return res.status(500).json({
                        error: "Smart contract execution failed: " + (txError.reason || txError.message)
                    });
                }
            }
        );
    } catch (error) {
        console.error("Issue reward handler error:", error);
        return res.status(500).json({
            error: error.message
        });
    }
});

// =====================================
// Admin Check Balance of Any Wallet
// ADMIN ONLY
// =====================================
router.get("/balance/:address", verifyToken, isAdmin, async (req, res) => {
    try {
        const address = req.params.address.trim();

        if (!ethers.isAddress(address)) {
            return res.status(400).json({
                error: "Invalid Ethereum address format"
            });
        }

        const balance = await tokenContract.balanceOf(address);

        // Also check if wallet belongs to a registered student
        db.get(
            `SELECT studentId, name FROM students WHERE LOWER(wallet) = LOWER(?)`,
            [address],
            (err, student) => {
                res.json({
                    wallet: address,
                    balance: balance.toString(),
                    studentId: student ? student.studentId : null,
                    studentName: student ? student.name : null
                });
            }
        );
    } catch (error) {
        res.status(500).json({
            error: "Failed to fetch balance: " + error.message
        });
    }
});

// =====================================
// Student Own Balance
// STUDENT ONLY
// =====================================
router.get("/my-balance", verifyToken, isStudent, async (req, res) => {
    try {
        const studentId = req.user.studentId;

        db.get(
            `SELECT wallet, name FROM students WHERE studentId = ?`,
            [studentId],
            async (err, student) => {
                if (err) {
                    return res.status(500).json({ error: err.message });
                }

                if (!student) {
                    return res.status(404).json({ error: "Student profile not found" });
                }

                try {
                    const targetWallet = ethers.getAddress(student.wallet.trim().toLowerCase());
                    const balance = await tokenContract.balanceOf(targetWallet);
                    res.json({
                        studentId,
                        name: student.name,
                        wallet: targetWallet,
                        balance: balance.toString()
                    });
                } catch (bcErr) {
                    res.status(500).json({
                        error: "Blockchain error: " + bcErr.message
                    });
                }
            }
        );
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

// =====================================
// Student Own Reward History
// STUDENT ONLY
// =====================================
router.get("/my-history", verifyToken, isStudent, (req, res) => {
    const studentId = req.user.studentId;

    db.get(
        `SELECT wallet FROM students WHERE studentId = ?`,
        [studentId],
        (err, student) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            if (!student) {
                return res.status(404).json({ error: "Student profile not found" });
            }

            db.all(
                `SELECT r.id, r.student, r.amount, r.reason, r.transactionHash, r.createdAt
                 FROM rewards r
                 WHERE LOWER(r.student) = LOWER(?)
                 ORDER BY r.id DESC`,
                [student.wallet],
                (dbErr, rows) => {
                    if (dbErr) {
                        return res.status(500).json({ error: dbErr.message });
                    }
                    res.json(rows || []);
                }
            );
        }
    );
});

// =====================================
// Admin Reward History (with Student Details, Search & Pagination)
// ADMIN ONLY
// =====================================
router.get("/history", verifyToken, isAdmin, (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.max(1, Number(req.query.limit) || 10);
    const offset = (page - 1) * limit;
    const search = req.query.search ? String(req.query.search).trim() : null;

    let baseSql = `
        SELECT 
            r.id, 
            r.student AS wallet, 
            r.amount, 
            r.reason, 
            r.transactionHash, 
            r.createdAt,
            s.studentId,
            s.name AS studentName
        FROM rewards r
        LEFT JOIN students s ON LOWER(r.student) = LOWER(s.wallet)
    `;

    let countSql = `
        SELECT COUNT(*) AS total
        FROM rewards r
        LEFT JOIN students s ON LOWER(r.student) = LOWER(s.wallet)
    `;

    let params = [];

    if (search) {
        const pattern = `%${search}%`;
        const filterClause = ` WHERE s.studentId LIKE ? OR s.name LIKE ? OR r.student LIKE ? OR r.reason LIKE ? OR r.transactionHash LIKE ?`;
        baseSql += filterClause;
        countSql += filterClause;
        params = [pattern, pattern, pattern, pattern, pattern];
    }

    baseSql += ` ORDER BY r.id DESC LIMIT ? OFFSET ?`;

    db.get(countSql, params, (err, countRow) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const totalRecords = countRow ? countRow.total : 0;

        db.all(baseSql, [...params, limit, offset], (rowErr, rows) => {
            if (rowErr) {
                return res.status(500).json({ error: rowErr.message });
            }

            res.json({
                page,
                limit,
                total: totalRecords,
                totalPages: Math.ceil(totalRecords / limit) || 1,
                data: rows || []
            });
        });
    });
});

// =====================================
// Reward Statistics
// ADMIN ONLY
// =====================================
router.get("/stats", verifyToken, isAdmin, (req, res) => {
    db.get(
        `SELECT
            COUNT(*) AS totalRewards,
            COALESCE(SUM(amount), 0) AS totalTokens
         FROM rewards`,
        [],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            res.json({
                totalRewards: row ? row.totalRewards : 0,
                totalTokens: row ? row.totalTokens : 0
            });
        }
    );
});

// =====================================
// Top Reward Students (Leaderboard)
// ADMIN ONLY & PUBLIC
// =====================================
router.get("/top-students", verifyToken, (req, res) => {
    db.all(
        `SELECT
            r.student AS wallet,
            s.studentId,
            COALESCE(s.name, 'Unknown Student') AS name,
            COUNT(r.id) AS rewardCount,
            SUM(r.amount) AS totalReward
         FROM rewards r
         LEFT JOIN students s ON LOWER(r.student) = LOWER(s.wallet)
         GROUP BY r.student
         ORDER BY totalReward DESC
         LIMIT 10`,
        [],
        (err, rows) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            res.json(rows || []);
        }
    );
});

// =====================================
// System & Blockchain Health Status
// =====================================
router.get("/status", async (req, res) => {
    const bcStatus = await checkConnection();
    let tokenName = "ICTU Reward Token";
    let tokenSymbol = "ICTU";

    if (bcStatus.connected) {
        try {
            tokenName = await tokenContract.name();
            tokenSymbol = await tokenContract.symbol();
        } catch (e) {
            // Ignore if contracts not yet deployed
        }
    }

    res.json({
        service: "ICTU Blockchain Reward Backend",
        status: "RUNNING",
        timestamp: new Date().toISOString(),
        blockchain: {
            ...bcStatus,
            tokenName,
            tokenSymbol,
            tokenAddress: rewardTokenAddress,
            managerAddress: rewardManagerAddress
        }
    });
});

// =====================================
// Create Reward Proposal
// TEACHER OR ADMIN
// =====================================
router.post("/proposals", verifyToken, isTeacherOrAdmin, (req, res) => {
    const { studentId, amount, reason } = req.body;

    if (!studentId || amount === undefined || amount === null || !reason) {
        return res.status(400).json({
            error: "Vui lòng nhập đầy đủ: Mã sinh viên, số lượng token và lý do khen thưởng"
        });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !Number.isInteger(numAmount)) {
        return res.status(400).json({
            error: "Số lượng token phải là số nguyên dương lớn hơn 0"
        });
    }

    const cleanId = String(studentId).trim();
    const cleanReason = String(reason).trim();

    // Lookup student
    db.get(
        `SELECT * FROM students WHERE LOWER(studentId) = LOWER(?) OR LOWER(wallet) = LOWER(?)`,
        [cleanId, cleanId],
        (err, student) => {
            if (err) {
                return res.status(500).json({ error: "Lỗi cơ sở dữ liệu: " + err.message });
            }
            if (!student) {
                return res.status(404).json({ error: `Không tìm thấy sinh viên với mã: '${cleanId}'` });
            }

            const teacherUsername = req.user.username;
            const teacherName = req.user.name || req.user.username;

            let cleanWallet = student.wallet;
            try {
                cleanWallet = ethers.getAddress(student.wallet.trim().toLowerCase());
            } catch (e) {
                cleanWallet = student.wallet;
            }

            db.run(
                `INSERT INTO proposals (teacherUsername, teacherName, studentId, studentName, studentWallet, amount, reason, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
                [teacherUsername, teacherName, student.studentId, student.name, cleanWallet, numAmount, cleanReason],
                function (insErr) {
                    if (insErr) {
                        return res.status(500).json({ error: "Lỗi lưu đề xuất: " + insErr.message });
                    }

                    return res.status(201).json({
                        success: true,
                        message: "Đề xuất khen thưởng đã được gửi thành công tới Ban Quản trị phê duyệt",
                        proposalId: this.lastID,
                        proposal: {
                            id: this.lastID,
                            teacherName,
                            studentId: student.studentId,
                            studentName: student.name,
                            studentWallet: cleanWallet,
                            amount: numAmount,
                            reason: cleanReason,
                            status: "PENDING"
                        }
                    });
                }
            );
        }
    );
});

// =====================================
// Get Proposals List
// ADMIN sees all proposals, TEACHER sees own proposals
// =====================================
router.get("/proposals", verifyToken, isTeacherOrAdmin, (req, res) => {
    let sql = `SELECT * FROM proposals`;
    let params = [];

    if (req.user.role === "TEACHER") {
        sql += ` WHERE LOWER(teacherUsername) = LOWER(?)`;
        params.push(req.user.username);
    }

    sql += ` ORDER BY id DESC`;

    db.all(sql, params, (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Lỗi truy vấn đề xuất: " + err.message });
        }
        res.json(rows);
    });
});

// =====================================
// Approve Proposal & Issue on Blockchain
// ADMIN ONLY
// =====================================
router.post("/proposals/:id/approve", verifyToken, isAdmin, async (req, res) => {
    const proposalId = req.params.id;

    db.get(
        `SELECT * FROM proposals WHERE id = ?`,
        [proposalId],
        async (err, proposal) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!proposal) {
                return res.status(404).json({ error: "Không tìm thấy đề xuất khen thưởng này" });
            }
            if (proposal.status !== "PENDING") {
                return res.status(400).json({
                    error: `Đề xuất này đã được xử lý (Trạng thái hiện tại: ${proposal.status})`
                });
            }

            try {
                // Ensure proper EIP-55 checksum on target wallet
                const targetWallet = ethers.getAddress(proposal.studentWallet.trim().toLowerCase());

                // Call Smart Contract on Blockchain
                const tx = await managerContract.issueReward(
                    targetWallet,
                    proposal.amount,
                    proposal.reason
                );

                const receipt = await tx.wait();

                // Save to rewards table
                db.run(
                    `INSERT INTO rewards (student, amount, reason, transactionHash) VALUES (?, ?, ?, ?)`,
                    [targetWallet, proposal.amount, proposal.reason, tx.hash],
                    function (insertRewardErr) {
                        if (insertRewardErr) {
                            console.error("Warning insert reward:", insertRewardErr.message);
                        }

                        // Update proposal status
                        db.run(
                            `UPDATE proposals SET status = 'APPROVED', transactionHash = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                            [tx.hash, proposalId],
                            function (upErr) {
                                if (upErr) {
                                    console.error("Warning update proposal:", upErr.message);
                                }

                                return res.json({
                                    success: true,
                                    message: "Phê duyệt thành công và đã ghi nhận khen thưởng lên Blockchain!",
                                    proposalId: Number(proposalId),
                                    transactionHash: tx.hash,
                                    blockNumber: receipt.blockNumber,
                                    gasUsed: receipt.gasUsed.toString(),
                                    student: proposal.studentName,
                                    studentId: proposal.studentId,
                                    amount: proposal.amount
                                });
                            }
                        );
                    }
                );
            } catch (bcError) {
                console.error("Blockchain error on approval:", bcError);
                return res.status(500).json({
                    error: "Lỗi thực thi Smart Contract: " + (bcError.reason || bcError.message)
                });
            }
        }
    );
});

// =====================================
// Reject Proposal
// ADMIN ONLY
// =====================================
router.post("/proposals/:id/reject", verifyToken, isAdmin, (req, res) => {
    const proposalId = req.params.id;
    const { rejectReason } = req.body;

    const reason = rejectReason ? String(rejectReason).trim() : "Chưa đạt tiêu chuẩn xét thưởng";

    db.get(
        `SELECT * FROM proposals WHERE id = ?`,
        [proposalId],
        (err, proposal) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (!proposal) {
                return res.status(404).json({ error: "Không tìm thấy đề xuất" });
            }
            if (proposal.status !== "PENDING") {
                return res.status(400).json({
                    error: `Đề xuất đã được xử lý từ trước (${proposal.status})`
                });
            }

            db.run(
                `UPDATE proposals SET status = 'REJECTED', rejectReason = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
                [reason, proposalId],
                function (upErr) {
                    if (upErr) {
                        return res.status(500).json({ error: upErr.message });
                    }
                    return res.json({
                        success: true,
                        message: "Đã từ chối đề xuất khen thưởng",
                        proposalId: Number(proposalId),
                        rejectReason: reason
                    });
                }
            );
        }
    );
});

module.exports = router;