// ==========================================
// Cổng Đăng nhập ICTU (login.js)
// Giao diện chuẩn Cổng thông tin Sinh viên ICTU (sinhvien.ictu.edu.vn)
// Hỗ trợ Google Identity Services (OAuth 2.0 Real Flow)
// ==========================================

const AUTH_BASE = typeof API_BASE !== "undefined" ? API_BASE : (typeof window !== "undefined" && window.API_BASE ? window.API_BASE : "http://localhost:3000/api");
const LOGIN_API = `${AUTH_BASE}/auth/login`;
const GOOGLE_AUTH_API = `${AUTH_BASE}/auth/google`;

// Cấu hình Client ID của Google OAuth 2.0
const GOOGLE_CLIENT_ID = "1028946700644-let2h5pk92fapkbn6psh2ijsh6iiatkg.apps.googleusercontent.com";

let googleTokenClient = null;
let currentAuthRoleTarget = "STUDENT"; // "STUDENT" hoặc "TEACHER"

// ==========================================
// Khởi tạo trang
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Mặc định mở Bước 1: Chọn vai trò
    showStep("stepRoleSelection");

    // Khởi tạo Google Identity Services
    initGoogleIdentityServices();
});

// ==========================================
// Điều hướng giữa các bước (Steps)
// ==========================================
function showStep(stepId) {
    const steps = ["stepRoleSelection", "stepStudentLogin", "stepAdminLogin"];
    steps.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = (id === stepId) ? "block" : "none";
        }
    });

    if (stepId === "stepStudentLogin") {
        currentAuthRoleTarget = "STUDENT";
    } else if (stepId === "stepAdminLogin") {
        currentAuthRoleTarget = "TEACHER";
    }
}

// Bật / tắt form mật khẩu truyền thống của sinh viên
function toggleStudentPasswordForm() {
    const form = document.getElementById("studentPasswordForm");
    const toggleText = document.getElementById("pwdToggleText");
    const toggleIcon = document.getElementById("pwdToggleIcon");

    if (!form) return;

    if (form.style.display === "none" || !form.style.display) {
        form.style.display = "block";
        if (toggleText) toggleText.textContent = "Ẩn form mật khẩu truyền thống";
        if (toggleIcon) toggleIcon.textContent = "▲";
        const input = document.getElementById("studentIdInput");
        if (input) input.focus();
    } else {
        form.style.display = "none";
        if (toggleText) toggleText.textContent = "Đăng nhập bằng Mã sinh viên & Mật khẩu";
        if (toggleIcon) toggleIcon.textContent = "🔐";
    }
}

// ==========================================
// Khởi tạo Google Identity Services (OAuth 2.0)
// ==========================================
function initGoogleIdentityServices() {
    if (typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
        try {
            googleTokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
                prompt: "select_account",
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        await performGoogleBackendAuth({ access_token: tokenResponse.access_token });
                    } else if (tokenResponse && tokenResponse.error) {
                        console.error("Google token error:", tokenResponse);
                        if (tokenResponse.error !== "popup_closed_by_user") {
                            showToast("Lỗi xác thực Google: " + tokenResponse.error, "error");
                        }
                    }
                }
            });
        } catch (e) {
            console.warn("Lỗi khởi tạo Google Token Client:", e);
        }
    }
}

// Kích hoạt cửa sổ chọn tài khoản Google thật
function triggerGoogleSignIn(roleTarget) {
    currentAuthRoleTarget = roleTarget || "STUDENT";

    // Đảm bảo client đã khởi tạo
    if (!googleTokenClient && typeof google !== "undefined" && google.accounts && google.accounts.oauth2) {
        initGoogleIdentityServices();
    }

    if (googleTokenClient) {
        // Luôn yêu cầu hiện bảng Chọn tài khoản của Google (prompt: 'select_account')
        googleTokenClient.requestAccessToken({ prompt: "select_account" });
    } else {
        showToast("Đang kết nối tới máy chủ Google... Vui lòng thử lại sau 2 giây.", "info");
        setTimeout(() => {
            initGoogleIdentityServices();
            if (googleTokenClient) {
                googleTokenClient.requestAccessToken({ prompt: "select_account" });
            } else {
                showToast("Không thể kết nối đến Google Identity Services. Vui lòng kiểm tra lại mạng.", "error");
            }
        }, 1200);
    }
}

// Nút Microsoft (Hướng dẫn sử dụng email @ms.ictu.edu.vn)
function triggerMicrosoftSignIn(roleTarget) {
    currentAuthRoleTarget = roleTarget || "STUDENT";
    showToast("Email @ms.ictu.edu.vn của trường có thể đăng nhập trực tiếp qua cổng Google hoặc dùng form Mã SV.", "info");
    toggleStudentPasswordForm();
}

// ==========================================
// Gửi Access Token / Credential lên Backend
// ==========================================
async function performGoogleBackendAuth(payload) {
    showToast("⏳ Đang xác thực tài khoản với máy chủ...", "info");

    try {
        const response = await fetch(GOOGLE_AUTH_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Xác thực Google thất bại", "error");
            return;
        }

        // Lưu thông tin phiên đăng nhập
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data));

        const welcomeName = data.studentName || data.teacherName || data.name || data.username;
        showToast(`🎉 Xin chào ${welcomeName}! Đang chuyển hướng...`, "success");

        setTimeout(() => {
            if (data.role === "ADMIN") {
                window.location.href = "index.html";
            } else if (data.role === "TEACHER") {
                window.location.href = "teacher.html";
            } else {
                window.location.href = "student.html";
            }
        }, 500);

    } catch (err) {
        console.error("Google Auth Backend error:", err);
        showToast("Lỗi kết nối tới máy chủ khi xác thực Google", "error");
    }
}

// ==========================================
// Đăng nhập Cán bộ / Giảng viên truyền thống
// ==========================================
async function handleTeacherLoginSubmit(event) {
    event.preventDefault();

    const email = document.getElementById("teacherEmailInput").value.trim();
    const password = document.getElementById("teacherPasswordInput").value.trim();
    const submitBtn = document.getElementById("teacherSubmitBtn");

    if (!email || !password) {
        showToast("Vui lòng nhập email trường và mật khẩu", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ Đang xác thực...";

    try {
        const response = await fetch(LOGIN_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Đăng nhập Quản trị / Giảng viên";
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data));

        const displayName = data.teacherName || data.name || data.username;
        showToast(`🎉 Xin chào ${displayName}! Đang chuyển hướng...`, "success");

        setTimeout(() => {
            if (data.role === "ADMIN") {
                window.location.href = "index.html";
            } else if (data.role === "TEACHER") {
                window.location.href = "teacher.html";
            } else {
                window.location.href = "student.html";
            }
        }, 500);

    } catch (err) {
        console.error("Teacher login error:", err);
        showToast("Lỗi kết nối máy chủ backend", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "🚀 Đăng nhập Quản trị / Giảng viên";
    }
}

// ==========================================
// Đăng nhập Sinh viên truyền thống (Mã SV + Mật khẩu)
// ==========================================
async function handleStudentLoginSubmit(event) {
    event.preventDefault();

    const studentId = document.getElementById("studentIdInput").value.trim();
    const password = document.getElementById("studentPasswordInput").value.trim();
    const submitBtn = document.getElementById("studentSubmitBtn");

    if (!studentId || !password) {
        showToast("Vui lòng nhập đầy đủ mã sinh viên và mật khẩu", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ Đang xác thực sinh viên...";

    try {
        const response = await fetch(LOGIN_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: studentId, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Đăng nhập sinh viên thất bại", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Đăng nhập bằng Mã SV";
            return;
        }

        if (data.role !== "STUDENT") {
            showToast("Tài khoản này không thuộc nhóm Sinh viên. Vui lòng đăng nhập qua cổng Quản trị.", "warning");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Đăng nhập bằng Mã SV";
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data));

        const studentName = data.studentName || data.name || data.studentId;
        showToast(`🎉 Xin chào ${studentName}! Đang chuyển hướng...`, "success");

        setTimeout(() => {
            window.location.href = "student.html";
        }, 500);

    } catch (err) {
        console.error("Student login error:", err);
        showToast("Lỗi kết nối máy chủ backend", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "🚀 Đăng nhập bằng Mã SV";
    }
}

// Password toggle helper
function togglePassword(inputId, btnId) {
    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input || !btn) return;
    if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
    } else {
        input.type = "password";
        btn.textContent = "👁️";
    }
}
