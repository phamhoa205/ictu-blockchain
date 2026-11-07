require("dotenv").config();
const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "ictu_reward_jwt_secret_key_2026_super_secure";
const LEGACY_SECRET = "ictu_reward_secret_key";

// ==========================
// Verify JWT Token
// ==========================
function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({
            error: "No token provided. Please log in."
        });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
        return res.status(401).json({
            error: "Invalid token format (Bearer token expected)"
        });
    }

    const token = parts[1];

    try {
        let decoded;
        try {
            decoded = jwt.verify(token, SECRET);
        } catch (e) {
            // Fallback for tokens issued with legacy secret
            decoded = jwt.verify(token, LEGACY_SECRET);
        }
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({
            error: "Token invalid or expired. Please log in again."
        });
    }
}

// ==========================
// Check Admin Permission
// ==========================
function isAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    if (req.user.role !== "ADMIN") {
        return res.status(403).json({
            error: "Access denied. Admin privileges required."
        });
    }

    next();
}

// ==========================
// Check Teacher Permission
// ==========================
function isTeacher(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    if (req.user.role !== "TEACHER") {
        return res.status(403).json({
            error: "Access denied. Teacher privileges required."
        });
    }

    next();
}

// ==========================
// Check Teacher or Admin Permission
// ==========================
function isTeacherOrAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    if (req.user.role !== "ADMIN" && req.user.role !== "TEACHER") {
        return res.status(403).json({
            error: "Access denied. Teacher or Admin privileges required."
        });
    }

    next();
}

// ==========================
// Check Student Permission
// ==========================
function isStudent(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Unauthorized"
        });
    }

    if (req.user.role !== "STUDENT") {
        return res.status(403).json({
            error: "Access denied. Student privileges required."
        });
    }

    next();
}

module.exports = {
    verifyToken,
    isAdmin,
    isTeacher,
    isTeacherOrAdmin,
    isStudent,
    SECRET
};