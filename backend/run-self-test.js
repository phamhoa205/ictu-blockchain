require("dotenv").config();
const http = require("http");

// Import the Express app from server
// We will spin up server and run tests against it
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", require("./routes/auth"));
app.use("/api/student", require("./routes/student"));
app.use("/api/reward", require("./routes/reward"));

app.get("/", (req, res) => {
    res.json({ message: "ICTU Reward Backend Running", status: "OK" });
});

const PORT = 3000;
const server = app.listen(PORT, async () => {
    console.log(`🚀 Test Server temporarily running on port ${PORT}...`);
    try {
        const { fork } = require("child_process");
        const testProcess = fork("./backend/test-integration.js");
        
        testProcess.on("exit", (code) => {
            console.log(`\n🛑 Test runner exited with code: ${code}`);
            server.close(() => {
                console.log("Server closed cleanly.");
                process.exit(code);
            });
        });
    } catch (err) {
        console.error("Test execution failed:", err);
        server.close();
        process.exit(1);
    }
});
