require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();


// ==========================
// Middleware
// ==========================

app.use(
    cors()
);


app.use(
    express.json()
);



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
// Test API
// ==========================

app.get("/",(req,res)=>{


    res.json({

        message:
        "ICTU Reward Backend Running",

        status:
        "OK"

    });


});





// ==========================
// Error Handler
// ==========================

app.use((err,req,res,next)=>{


    console.error(err);


    res.status(500)
    .json({

        error:
        "Internal Server Error"

    });


});





// ==========================
// Start Server
// ==========================

const PORT =
process.env.PORT || 3000;



app.listen(
PORT,
()=>{


    console.log(
        `🚀 Server running on port ${PORT}`
    );


});