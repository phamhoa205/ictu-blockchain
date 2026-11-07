const http = require("http");

function request(options, data = null) {
    return new Promise((resolve, reject) => {
        const req = http.request(options, (res) => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => {
                let parsed = body;
                try {
                    parsed = JSON.parse(body);
                } catch (e) {}
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on("error", reject);
        if (data) {
            req.write(typeof data === "string" ? data : JSON.stringify(data));
        }
        req.end();
    });
}

async function runTests() {
    console.log("==================================================");
    console.log("  KIỂM THỬ FORM ĐĂNG NHẬP GIẢNG VIÊN & SINH VIÊN  ");
    console.log("==================================================");

    let passCount = 0;
    let failCount = 0;

    function assert(desc, condition, details = "") {
        if (condition) {
            console.log(`✅ [PASS] ${desc}`);
            passCount++;
        } else {
            console.error(`❌ [FAIL] ${desc} - ${details}`);
            failCount++;
        }
    }

    try {
        // Test 1: Teacher login with email nvthanh@ictu.edu.vn
        const t1Res = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "nvthanh@ictu.edu.vn",
            password: "123456"
        });
        assert("Giảng viên nvthanh@ictu.edu.vn đăng nhập thành công qua form", 
            t1Res.status === 200 && t1Res.body.token && t1Res.body.role === "TEACHER");

        // Test 2: Teacher login with email ptthao@ictu.edu.vn
        const t2Res = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "ptthao@ictu.edu.vn",
            password: "123456"
        });
        assert("Giảng viên ptthao@ictu.edu.vn đăng nhập thành công qua form", 
            t2Res.status === 200 && t2Res.body.token && t2Res.body.role === "TEACHER");

        // Test 3: Admin login with username admin
        const aRes = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "admin",
            password: "123456"
        });
        assert("Admin đăng nhập thành công (admin / 123456)", 
            aRes.status === 200 && aRes.body.role === "ADMIN");

        // Test 4: Student login with lowercase dtc235180075
        const sv1Res = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "dtc235180075",
            password: "ictu@123456"
        });
        assert("Sinh viên đăng nhập thành công với mã dtc235180075", 
            sv1Res.status === 200 && sv1Res.body.role === "STUDENT" && sv1Res.body.studentId === "DTC235180075");

        // Test 5: Student login with uppercase DTC235180075
        const sv2Res = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "DTC235180075",
            password: "ictu@123456"
        });
        assert("Sinh viên đăng nhập thành công với mã hoa DTC235180075", 
            sv2Res.status === 200 && sv2Res.body.role === "STUDENT");

        // Test 6: Incorrect password returns 401
        const badPwdRes = await request({
            hostname: "localhost",
            port: 3000,
            path: "/api/auth/login",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, {
            username: "dtc235180075",
            password: "wrongpassword"
        });
        assert("Sai mật khẩu bị từ chối truy cập (401 Unauthorized)", badPwdRes.status === 401);

    } catch (e) {
        console.error("Lỗi thực thi kiểm thử:", e);
        failCount++;
    }

    console.log("\n==================================================");
    console.log(`KẾT QUẢ KIỂM THỬ: ${passCount} ĐẠT, ${failCount} HỎNG`);
    console.log("==================================================");
    process.exit(failCount === 0 ? 0 : 1);
}

runTests();
