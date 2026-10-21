const http = require("http");

const BASE_URL = "http://localhost:3000";

function makeRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);
        const headers = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const req = http.request(url, { method, headers }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                let parsed = data;
                try {
                    parsed = JSON.parse(data);
                } catch (e) {}
                resolve({ status: res.statusCode, data: parsed });
            });
        });

        req.on("error", err => reject(err));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTests() {
    console.log("==========================================");
    console.log("🧪 ICTU BLOCKCHAIN REWARD INTEGRATION TEST");
    console.log("==========================================");

    let passed = 0;
    let failed = 0;

    function assert(desc, condition, details = "") {
        if (condition) {
            console.log(`  ✅ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`  ❌ FAIL: ${desc} ${details ? "- " + JSON.stringify(details) : ""}`);
            failed++;
        }
    }

    try {
        // 1. Health check
        console.log("\n[Test Suite 1] Server Health");
        const health = await makeRequest("GET", "/");
        assert("Server is running", health.status === 200);

        const statusRes = await makeRequest("GET", "/api/reward/status");
        assert("Status endpoint returns 200", statusRes.status === 200);
        console.log("    Blockchain connected:", statusRes.data.blockchain ? statusRes.data.blockchain.connected : false);

        // 2. Authentication
        console.log("\n[Test Suite 2] Authentication & Login");
        const adminLogin = await makeRequest("POST", "/api/auth/login", { username: "admin", password: "123456" });
        assert("Admin login success (200)", adminLogin.status === 200 && adminLogin.data.token && adminLogin.data.role === "ADMIN", adminLogin.data);
        const adminToken = adminLogin.data.token;

        const studentLogin = await makeRequest("POST", "/api/auth/login", { username: "hoa", password: "123456" });
        assert("Student login success (200)", studentLogin.status === 200 && studentLogin.data.token && studentLogin.data.role === "STUDENT", studentLogin.data);
        const studentToken = studentLogin.data.token;

        const badLogin = await makeRequest("POST", "/api/auth/login", { username: "admin", password: "wrongpassword" });
        assert("Invalid password rejected (401)", badLogin.status === 401);

        // 3. RBAC & Access Control
        console.log("\n[Test Suite 3] Role-Based Access Control (RBAC)");
        const adminCanGetStudents = await makeRequest("GET", "/api/student", null, adminToken);
        assert("Admin can get students list (200)", adminCanGetStudents.status === 200 && Array.isArray(adminCanGetStudents.data));

        const studentDeniedStudentList = await makeRequest("GET", "/api/student", null, studentToken);
        assert("Student cannot access Admin student list (403)", studentDeniedStudentList.status === 403);

        const studentDeniedIssue = await makeRequest("POST", "/api/reward/issue", { studentId: "DTC001", amount: 10 }, studentToken);
        assert("Student cannot issue rewards (403)", studentDeniedIssue.status === 403);

        // 4. Input Validation & Error Handling
        console.log("\n[Test Suite 4] Input Validation & Edge Cases");
        const negAmount = await makeRequest("POST", "/api/reward/issue", { studentId: "DTC001", amount: -50 }, adminToken);
        assert("Negative amount rejected (400)", negAmount.status === 400);

        const nonExistentStudent = await makeRequest("POST", "/api/reward/issue", { studentId: "DTC_NON_EXISTENT", amount: 100 }, adminToken);
        assert("Non-existent student rejected (404)", nonExistentStudent.status === 404);

        // 5. Student Queries
        console.log("\n[Test Suite 5] Student Endpoints");
        const studentProfile = await makeRequest("GET", "/api/student/profile", null, studentToken);
        assert("Student can fetch own profile (200)", studentProfile.status === 200 && studentProfile.data.studentId === "DTC001");

        const studentHistory = await makeRequest("GET", "/api/reward/my-history", null, studentToken);
        assert("Student can fetch own history (200)", studentHistory.status === 200 && Array.isArray(studentHistory.data));

        // 6. Statistics & Leaderboard
        console.log("\n[Test Suite 6] Statistics & Leaderboard");
        const stats = await makeRequest("GET", "/api/reward/stats", null, adminToken);
        assert("Admin can fetch reward stats (200)", stats.status === 200 && stats.data.totalRewards !== undefined);

        const topStudents = await makeRequest("GET", "/api/reward/top-students", null, adminToken);
        assert("Admin can fetch top students leaderboard (200)", topStudents.status === 200 && Array.isArray(topStudents.data));

        const adminHistory = await makeRequest("GET", "/api/reward/history?page=1&limit=5", null, adminToken);
        assert("Admin history returns paginated data (200)", adminHistory.status === 200 && Array.isArray(adminHistory.data.data));

        console.log("\n==========================================");
        console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
        console.log("==========================================");

        if (failed === 0) {
            console.log("🎉 ALL INTEGRATION TESTS PASSED!");
            process.exit(0);
        } else {
            console.error("❌ Some tests failed.");
            process.exit(1);
        }

    } catch (err) {
        console.error("Test execution error (is backend server running on port 3000?):", err.message);
        process.exit(1);
    }
}

runTests();
