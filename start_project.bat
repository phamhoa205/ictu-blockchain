
@echo off
setlocal
title ICTU Blockchain Reward System

cd /d D:\NCKH_Blockchain

echo ==========================================
echo   ICTU BLOCKCHAIN REWARD SYSTEM
echo ==========================================

echo.
echo [1/5] Starting Hardhat Node...
start "Hardhat Node" cmd /k "cd /d D:\NCKH_Blockchain && npx hardhat node"

echo Waiting for Hardhat Node...
timeout /t 10 /nobreak >nul

echo.
echo [2/5] Deploying smart contracts...
call npx hardhat run scripts/deployRewardSystem.ts --network localhost

if errorlevel 1 (
    echo ERROR: Deploy contracts failed!
    pause
    exit /b 1
)

echo.
echo [3/5] Granting MINTER_ROLE...
call npx hardhat run scripts/setupRole.ts --network localhost

if errorlevel 1 (
    echo ERROR: Granting MINTER_ROLE failed!
    pause
    exit /b 1
)

echo.
echo [4/5] Starting Backend...
start "ICTU Backend" cmd /k "cd /d D:\NCKH_Blockchain\backend && node server.js"

echo.
echo [5/5] Starting Frontend...
start "ICTU Frontend" cmd /k "cd /d D:\NCKH_Blockchain\frontend && python -m http.server 5500"

echo.
echo ==========================================
echo All startup commands have been sent.
echo Login: http://localhost:5500/login.html
echo Admin: http://localhost:5500/index.html
echo Student: http://localhost:5500/student.html
echo ==========================================
pause