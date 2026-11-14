const LOGIN_API = `${typeof API_BASE !== "undefined" ? API_BASE : (typeof window !== "undefined" && window.API_BASE ? window.API_BASE : "http://localhost:3000/api")}/auth/login`;

// Initialize UI on page load
document.addEventListener("DOMContentLoaded", () => {
    switchLoginTab("TEACHER");
});

// ==========================================
// Tab Switching: Teacher vs Student
// ==========================================
function switchLoginTab(tab) {
    const teacherBtn = document.getElementById("tabTeacherBtn");
    const studentBtn = document.getElementById("tabStudentBtn");
    const teacherSection = document.getElementById("teacherSection");
    const studentSection = document.getElementById("studentSection");

    if (tab === "TEACHER") {
        teacherBtn.classList.add("active");
        studentBtn.classList.remove("active");
        teacherSection.style.display = "block";
        studentSection.style.display = "none";
    } else {
        studentBtn.classList.add("active");
        teacherBtn.classList.remove("active");
        teacherSection.style.display = "none";
        studentSection.style.display = "block";
    }
}

// ==========================================
// Teacher / Admin Login Handler (...@ictu.edu.vn)
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
            submitBtn.innerHTML = "🚀 Đăng nhập Giảng viên / Quản trị";
            return;
        }

        // Store credentials
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
        showToast("Lỗi kết nối máy chủ backend (Port 3000)", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "🚀 Đăng nhập Giảng viên / Quản trị";
    }
}

// ==========================================
// Student Login Handler (dtc235180075 / ictu@123456)
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
            submitBtn.innerHTML = "🚀 Đăng nhập Sinh viên";
            return;
        }

        if (data.role !== "STUDENT") {
            showToast("Tài khoản này không thuộc nhóm Sinh viên. Vui lòng đăng nhập ở tab Giảng viên.", "warning");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Đăng nhập Sinh viên";
            return;
        }

        // Store credentials
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data));

        const studentName = data.studentName || data.name || data.studentId;
        showToast(`🎉 Xin chào ${studentName}! Đang chuyển hướng...`, "success");

        setTimeout(() => {
            window.location.href = "student.html";
        }, 500);

    } catch (err) {
        console.error("Student login error:", err);
        showToast("Lỗi kết nối máy chủ backend (Port 3000)", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "🚀 Đăng nhập Sinh viên";
    }
}

// Quick fill helper for teacher demo
function quickFillTeacher(email, pass) {
    document.getElementById("teacherEmailInput").value = email;
    document.getElementById("teacherPasswordInput").value = pass;
    document.getElementById("teacherSubmitBtn").focus();
}

// Quick fill helper for student demo
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