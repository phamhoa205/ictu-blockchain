require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();


// ==========================
// Middleware
// ==========================

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    })
);

app.use(express.json());



// ==========================
// Routes
// ==========================


// Auth Route

const authRoute =
require("./routes/auth");


app.use(
    "/api/auth",
    authRoute
);




// Student Route

const studentRoute =
require("./routes/student");


app.use(
    "/api/student",
    studentRoute
);




// Reward Route

const rewardRoute =
require("./routes/reward");


app.use(
    "/api/reward",
    rewardRoute
);





// ==========================
// Test & Health Check API
// ==========================

app.get("/", (req, res) => {
    res.json({
        message: "ICTU Blockchain Reward Backend Running",
        status: "OK",
        docs: "/api/reward/status"
    });
});

app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString()
    });
});

// ==========================
// Error Handler
// ==========================

app.use((err, req, res, next) => {
    console.error("Express Error Handler:", err);
    res.status(500).json({
        error: err.message || "Internal Server Error"
    });
});

// ==========================
// Start Server
// ==========================

const PORT = process.env.PORT || 3000;

// Export App for Serverless / Testing
module.exports = app;

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
    });
}