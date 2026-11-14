// ==========================================
// Centralized API Configuration & Detection
// ==========================================

// URL Backend trên Render khi triển khai Cloud (Thay bằng URL Render của bạn nếu khác)
const DEFAULT_RENDER_API = "https://nckh-blockchain-backend.onrender.com/api";

function resolveApiBaseUrl() {
    // 1. Ưu tiên cấu hình do người dùng chủ động đặt qua giao diện / localStorage
    if (typeof window !== "undefined" && window.API_BASE_URL) {
        return window.API_BASE_URL;
    }
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem("API_BASE_URL") : null;
    if (stored) {
        return stored;
    }

    // 2. Tự động nhận diện môi trường: localhost vs Production Cloud (Vercel)
    if (typeof window !== "undefined" && window.location) {
        const hostname = window.location.hostname;
        const isLocal = hostname === "localhost" ||
                        hostname === "127.0.0.1" ||
                        hostname === "" ||
                        hostname === "::1";
        if (isLocal) {
            return "http://localhost:3000/api";
        }
    }

    // 3. Khi chạy trên domain thật (Vercel / Cloud), tự động trỏ về Backend Render
    return DEFAULT_RENDER_API;
}

const API_BASE = resolveApiBaseUrl();
if (typeof window !== "undefined") {
    window.API_BASE = API_BASE;
}

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
    const current = localStorage.getItem("API_BASE_URL") || API_BASE;
    const input = prompt(
        `Cấu hình địa chỉ Backend API (Render):\n\nĐịa chỉ hiện tại: ${current}\n\nNhập URL Backend mới (ví dụ: https://your-backend.onrender.com/api):\n(Để trống và bấm OK để khôi phục mặc định tự động theo môi trường localhost/Render):`,
        current
    );
    if (input !== null) {
        const trimmed = input.trim();
        if (!trimmed || trimmed === "http://localhost:3000/api" || trimmed === DEFAULT_RENDER_API) {
            localStorage.removeItem("API_BASE_URL");
            alert("Đã đặt lại máy chủ API về chế độ tự động nhận diện (localhost / Render)!");
        } else {
            const cleanUrl = trimmed.replace(/\/+$/, "");
            localStorage.setItem("API_BASE_URL", cleanUrl);
            alert("Đã lưu máy chủ API mới: " + cleanUrl);
        }
        location.reload();
    }
}

// ==========================================
// Evidence File & Cryptographic Hash Utilities
// ==========================================
window.currentEvidence = {
    issue: null,
    proposal: null
};

async function computeSha256(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleEvidenceFileSelect(event, type) {
    const file = event.target.files ? event.target.files[0] : null;
    if (!file) {
        clearEvidenceFile(type);
        return;
    }

    // Giới hạn dung lượng tối đa 2MB
    const MAX_SIZE = 2 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        showToast("⚠️ Dung lượng tệp minh chứng vượt quá 2MB! Vui lòng chọn tệp nhỏ hơn.", "error");
        event.target.value = "";
        clearEvidenceFile(type);
        return;
    }

    try {
        const hash = await computeSha256(file);
        const dataUrl = await readFileAsDataUrl(file);

        window.currentEvidence[type] = {
            fileName: file.name,
            fileSize: file.size,
            fileData: dataUrl,
            fileHash: hash
        };

        const previewBox = document.getElementById(`${type}EvidencePreview`);
        const nameEl = document.getElementById(`${type}EvidenceFileName`);
        const sizeEl = document.getElementById(`${type}EvidenceFileSize`);
        const hashEl = document.getElementById(`${type}EvidenceFileHash`);

        if (previewBox) previewBox.style.display = "block";
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `(${Math.round(file.size / 1024)} KB)`;
        if (hashEl) hashEl.textContent = hash;

        showToast("Đã tính mã băm SHA-256 cho tệp minh chứng!", "info");
    } catch (err) {
        console.error("Error processing evidence file:", err);
        showToast("Lỗi khi xử lý tệp minh chứng", "error");
        clearEvidenceFile(type);
    }
}

function clearEvidenceFile(type) {
    if (window.currentEvidence) {
        window.currentEvidence[type] = null;
    }
    const input = document.getElementById(`${type}EvidenceFile`);
    if (input) input.value = "";
    const previewBox = document.getElementById(`${type}EvidencePreview`);
    if (previewBox) previewBox.style.display = "none";
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}

function viewEvidence(item) {
    const modalBody = document.getElementById("evidenceModalBody");
    if (!modalBody) return;

    const fileName = item.name || "Tệp minh chứng đính kèm";
    const fileHash = item.hash || "Chưa có mã băm SHA-256";
    const fileData = item.data;
    const isImage = fileData && typeof fileData === "string" && fileData.startsWith("data:image/");
    const isPdf = fileData && typeof fileData === "string" && (fileData.startsWith("data:application/pdf") || (item.name && item.name.toLowerCase().endsWith(".pdf")));

    let filePreviewHtml = "";
    if (isImage) {
        filePreviewHtml = `
            <div style="margin-top: 12px; text-align: center; background: #0000000a; padding: 12px; border-radius: 8px; border: 1px solid var(--border);">
                <img src="${fileData}" alt="Minh chứng" style="max-width: 100%; max-height: 320px; object-fit: contain; border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                <div style="margin-top: 10px;">
                    <a href="${fileData}" download="${fileName}" class="btn btn-secondary btn-sm" style="font-size: 0.78rem;">⬇️ Tải ảnh minh chứng về máy</a>
                </div>
            </div>
        `;
    } else if (fileData) {
        filePreviewHtml = `
            <div style="margin-top: 12px; background: var(--bg-alt); padding: 14px; border-radius: 8px; border: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 1.8rem;">${isPdf ? "📄" : "📑"}</span>
                    <div>
                        <div style="font-weight: 600; color: var(--text-primary);">${fileName}</div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${isPdf ? "Tài liệu văn bản PDF" : "Tệp minh chứng đính kèm"}</div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    ${isPdf ? `<button type="button" class="btn btn-primary btn-sm" onclick="openPdfInNewTab('${fileData}')" style="font-size: 0.8rem;">👁️ Mở xem trực tiếp</button>` : ""}
                    <a href="${fileData}" download="${fileName}" class="btn btn-secondary btn-sm" style="font-size: 0.8rem;">⬇️ Tải tệp về</a>
                </div>
            </div>
        `;
    } else {
        filePreviewHtml = `
            <div style="margin-top: 12px; padding: 12px; background: var(--bg-alt); border-radius: 8px; border: 1px dashed var(--border); font-size: 0.84rem; color: var(--text-muted); text-align: center;">
                ℹ️ Bản ghi lưu mã băm mật mã SHA-256 trực tiếp trên Blockchain phục vụ đối soát.
            </div>
        `;
    }

    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="background: var(--bg-alt); padding: 12px 16px; border-radius: 8px; border: 1px solid var(--border); font-size: 0.88rem;">
                <div style="margin-bottom: 6px;"><b>Sinh viên:</b> ${item.studentName ? `${item.studentName} (${item.studentId || ""})` : "--"}</div>
                <div><b>Lý do khen thưởng:</b> ${item.reason || "--"}</div>
            </div>

            <div>
                <div style="font-size: 0.82rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">
                    🔐 Mã băm toàn vẹn (Cryptographic SHA-256 Hash):
                </div>
                <div style="display: flex; align-items: center; gap: 8px; background: white; padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);">
                    <code class="mono" style="word-break: break-all; font-size: 0.8rem; color: var(--primary); font-weight: 600;">${fileHash}</code>
                    <button type="button" class="btn btn-icon btn-sm" onclick="copyToClipboard('${fileHash}', 'Mã băm SHA-256')" title="Sao chép SHA-256">📋</button>
                </div>
                <small style="color: var(--text-muted); font-size: 0.76rem; margin-top: 4px; display: block;">
                    🛡️ Mã băm SHA-256 đảm bảo tệp minh chứng gốc không thể bị chỉnh sửa hay làm giả mạo sau khi nộp.
                </small>
            </div>

            ${filePreviewHtml}
        </div>
    `;

    openModal("evidenceModal");
}

function openPdfInNewTab(dataUrl) {
    try {
        const arr = dataUrl.split(",");
        const mime = (arr[0].match(/:(.*?);/) || [])[1] || "application/pdf";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, "_blank");
    } catch (e) {
        window.open(dataUrl, "_blank");
    }
}

// Tự động hiển thị API Base trên badge nếu có phần tử #displayApiBase
document.addEventListener("DOMContentLoaded", () => {
    const el = document.getElementById("displayApiBase");
    if (el) {
        el.textContent = API_BASE;
    }
});