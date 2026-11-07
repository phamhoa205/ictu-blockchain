// ==========================================
// Authentication & UI Utility Functions
// ==========================================

const API_BASE = window.API_BASE_URL || localStorage.getItem("API_BASE_URL") || "http://localhost:3000/api";

function getToken() {
    return localStorage.getItem("token");
}

function getUser() {
    const userStr = localStorage.getItem("user");
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        return null;
    }
}

function authHeader() {
    const token = getToken();
    return {
        "Content-Type": "application/json",
        "Authorization": token ? "Bearer " + token : ""
    };
}

function checkAdmin() {
    const user = getUser();
    const token = getToken();

    if (!user || !token) {
        window.location.href = "login.html";
        return null;
    }

    if (user.role !== "ADMIN") {
        showToast("Quyền truy cập bị từ chối: Yêu cầu vai trò Admin", "error");
        setTimeout(() => {
            if (user.role === "TEACHER") {
                window.location.href = "teacher.html";
            } else {
                window.location.href = "student.html";
            }
        }, 1200);
        return null;
    }

    return user;
}

function checkTeacher() {
    const user = getUser();
    const token = getToken();

    if (!user || !token) {
        window.location.href = "login.html";
        return null;
    }

    if (user.role !== "TEACHER" && user.role !== "ADMIN") {
        showToast("Quyền truy cập bị từ chối: Yêu cầu vai trò Giảng viên", "error");
        setTimeout(() => {
            window.location.href = "student.html";
        }, 1200);
        return null;
    }

    return user;
}

function checkStudent() {
    const user = getUser();
    const token = getToken();

    if (!user || !token) {
        window.location.href = "login.html";
        return null;
    }

    if (user.role !== "STUDENT") {
        if (user.role === "TEACHER") {
            window.location.href = "teacher.html";
        } else {
            window.location.href = "index.html";
        }
        return null;
    }

    return user;
}

function logout() {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.clear();
    showToast("Logged out successfully", "info");
    setTimeout(() => {
        window.location.href = "login.html";
    }, 400);
}

// ==========================================
// Toast Notification System
// ==========================================
function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;

    let icon = "ℹ️";
    if (type === "success") icon = "✅";
    if (type === "error") icon = "❌";
    if (type === "warning") icon = "⚠️";

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("toast-fade-out");
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

// ==========================================
// Formatting & Helpers
// ==========================================
function shortAddress(address) {
    if (!address) return "--";
    if (address.length <= 14) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function copyToClipboard(text, label = "Item") {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied ${label} to clipboard!`, "success");
    }).catch(() => {
        showToast("Failed to copy", "error");
    });
}

function formatDate(dateStr) {
    if (!dateStr) return "--";
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleString("vi-VN", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    } catch (e) {
        return dateStr;
    }
}

// ==========================================
// API Server Configuration Helper (for Online / Vercel demo)
// ==========================================
function promptConfigApiUrl() {
    const current = localStorage.getItem("API_BASE_URL") || "http://localhost:3000/api";
    const input = prompt(
        "Nhập địa chỉ máy chủ Backend API (ví dụ: https://nckh-api.onrender.com/api hoặc https://xxx.loca.lt/api):\n\nĐể trống và bấm OK nếu muốn dùng lại mặc định (http://localhost:3000/api):",
        current
    );
    if (input !== null) {
        const trimmed = input.trim();
        if (!trimmed || trimmed === "http://localhost:3000/api") {
            localStorage.removeItem("API_BASE_URL");
            alert("Đã đặt lại máy chủ API về mặc định: http://localhost:3000/api");
        } else {
            const cleanUrl = trimmed.replace(/\/+$/, "");
            localStorage.setItem("API_BASE_URL", cleanUrl);
            alert("Đã lưu máy chủ API mới: " + cleanUrl);
        }
        location.reload();
    }
}

// Tự động hiển thị API Base trên badge nếu có phần tử #displayApiBase
document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("displayApiBase");
    if (el) {
        el.textContent = API_BASE;
    }
});