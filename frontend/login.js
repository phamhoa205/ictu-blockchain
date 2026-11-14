// ==========================================
// Cổng Đăng nhập ICTU (login.js)
// Giao diện chuẩn Cổng thông tin Sinh viên ICTU (sinhvien.ictu.edu.vn)
// Hỗ trợ Google Identity Services (GIS) & Microsoft Email
// ==========================================

const AUTH_BASE = typeof API_BASE !== "undefined" ? API_BASE : (typeof window !== "undefined" && window.API_BASE ? window.API_BASE : "http://localhost:3000/api");
const LOGIN_API = `${AUTH_BASE}/auth/login`;
const GOOGLE_AUTH_API = `${AUTH_BASE}/auth/google`;

// Biến cấu hình Google Client ID (Nếu triển khai sản xuất có thể đặt window.GOOGLE_CLIENT_ID)
window.GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || "";

let currentAuthRoleTarget = "STUDENT"; // "STUDENT" hoặc "TEACHER"

// ==========================================
// Khởi tạo trang
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Mặc định mở Bước 1: Chọn vai trò
    showStep("stepRoleSelection");

    // Khởi tạo Google Identity Services (nếu có Client ID)
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
// Tích hợp Google Sign-In (GIS) & Demo Chooser
// ==========================================
function initGoogleIdentityServices() {
    if (window.google && window.google.accounts && window.GOOGLE_CLIENT_ID) {
        try {
            window.google.accounts.id.initialize({
                client_id: window.GOOGLE_CLIENT_ID,
                callback: handleGoogleCredentialResponse
            });
        } catch (e) {
            console.warn("Lỗi khởi tạo Google GIS:", e);
        }
    }
}

// Khi người dùng bấm nút Google
function triggerGoogleSignIn(roleTarget) {
    currentAuthRoleTarget = roleTarget || "STUDENT";

    // Nếu đã cấu hình Google Client ID thật trên domain
    if (window.google && window.google.accounts && window.GOOGLE_CLIENT_ID) {
        try {
            window.google.accounts.id.prompt();
            return;
        } catch (e) {
            console.warn("Không thể mở Google Prompt, chuyển sang hộp thoại demo:", e);
        }
    }

    // Mặc định hoặc chế độ demo: mở modal chọn tài khoản Google ICTU 1-chạm
    openGoogleDemoModal();
}

// Khi người dùng bấm nút Microsoft
function triggerMicrosoftSignIn(roleTarget) {
    currentAuthRoleTarget = roleTarget || "STUDENT";
    openGoogleDemoModal();
}

// Xử lý khi nhận Google ID Token thật từ Google Identity Services
async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) {
        showToast("Không nhận được thông tin xác thực từ Google", "error");
        return;
    }

    await performGoogleBackendAuth({ credential: response.credential });
}

// ==========================================
// Modal Chọn tài khoản Google Demo (1 chạm)
// ==========================================
function openGoogleDemoModal() {
    const modal = document.getElementById("googleDemoModal");
    if (modal) modal.classList.add("active");
}

function closeGoogleDemoModal() {
    const modal = document.getElementById("googleDemoModal");
    if (modal) modal.classList.remove("active");
}

// Khi click vào 1 tài khoản trong danh sách demo
async function selectGoogleAccount(email, name) {
    closeGoogleDemoModal();
    await performGoogleBackendAuth({ email, name });
}

// Khi người dùng gõ email Google tự nhập
async function submitCustomGoogleEmail() {
    const input = document.getElementById("customGoogleEmailInput");
    if (!input) return;
    const email = input.value.trim();

    if (!email || !email.includes("@")) {
        showToast("Vui lòng nhập địa chỉ email hợp lệ (VD: dtc235180077@ictu.edu.vn)", "warning");
        return;
    }

    closeGoogleDemoModal();
    await performGoogleBackendAuth({ email });
}

// ==========================================
// Gửi yêu cầu xác thực Google lên Backend
// ==========================================
async function performGoogleBackendAuth(payload) {
    showToast("⏳ Đang xác thực tài khoản Google với máy chủ...", "info");

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

// Quick fill helpers
function quickFillTeacher(email, pass) {
    document.getElementById("teacherEmailInput").value = email;
    document.getElementById("teacherPasswordInput").value = pass;
    document.getElementById("teacherSubmitBtn").focus();
}

function quickFillStudent(id, pass) {
    document.getElementById("studentIdInput").value = id;
    document.getElementById("studentPasswordInput").value = pass;
    document.getElementById("studentSubmitBtn").focus();
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
