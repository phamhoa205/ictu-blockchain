const LOGIN_API = "http://localhost:3000/api/auth/login";

// Quick fill helper for demo accounts
function quickFill(user, pass) {
    document.getElementById("username").value = user;
    document.getElementById("password").value = pass;
    document.getElementById("submitBtn").focus();
}

// Password toggle helper
function togglePassword() {
    const input = document.getElementById("password");
    const btn = document.getElementById("togglePwdBtn");
    if (input.type === "password") {
        input.type = "text";
        btn.textContent = "🙈";
    } else {
        input.type = "password";
        btn.textContent = "👁️";
    }
}

// Form submit handler
async function handleLoginSubmit(event) {
    event.preventDefault();
    await doLogin();
}

async function doLogin() {
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    const submitBtn = document.getElementById("submitBtn");

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        showToast("Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ Đang xác thực...";

    try {
        const response = await fetch(LOGIN_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Đăng nhập thất bại", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "🚀 Đăng nhập hệ thống";
            return;
        }

        // Store credentials
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data));

        showToast(`Xin chào ${data.studentName || data.username}! Đang chuyển hướng...`, "success");

        setTimeout(() => {
            if (data.role === "ADMIN") {
                window.location.href = "index.html";
            } else if (data.role === "STUDENT") {
                window.location.href = "student.html";
            } else {
                showToast("Quyền truy cập không xác định", "error");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "🚀 Đăng nhập hệ thống";
            }
        }, 700);

    } catch (error) {
        console.error("Login fetch error:", error);
        showToast("Lỗi kết nối máy chủ backend (Port 3000)", "error");
        submitBtn.disabled = false;
        submitBtn.innerHTML = "🚀 Đăng nhập hệ thống";
    }
}