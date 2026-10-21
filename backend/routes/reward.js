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

const { verifyToken, isAdmin, isStudent } = require("../middleware/auth");

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

        // Lookup student in SQLite
        db.get(
            `SELECT * FROM students WHERE studentId = ? OR LOWER(wallet) = LOWER(?)`,
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
                    // Send transaction to smart contract on blockchain
                    const tx = await managerContract.issueReward(
                        student.wallet,
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
                    const balance = await tokenContract.balanceOf(student.wallet);
                    res.json({
                        studentId,
                        name: student.name,
                        wallet: student.wallet,
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

module.exports = router;