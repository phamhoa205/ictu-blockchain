import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const dotenvPath = path.resolve(process.cwd(), "backend/node_modules/dotenv");
const dotenv = require(dotenvPath);

// Nạp biến môi trường từ ./backend/.env (fallback ./env)
let envLoaded = dotenv.config({ path: "./backend/.env" });
if (envLoaded.error) {
    dotenv.config({ path: "./.env" });
}

const { IBN_ACCOUNT_ID, IBN_API_KEY } = process.env;
const BASE_URL = process.env.IBN_BASE_URL || "https://ibn.ictu.edu.vn";
const CHAIN = "production";

// Địa chỉ 2 hợp đồng đã deploy thành công trên production
const REWARD_TOKEN_ADDRESS =
    process.env.REWARD_TOKEN_ADDRESS ||
    "0x8fAAB493059E219255CeA538C4678Bd52C14788b";

const REWARD_MANAGER_ADDRESS =
    process.env.REWARD_MANAGER_ADDRESS ||
    "0x76B4E34AD84A0c64c1810dfed493a033fcD15436";

const MAX_RETRIES = 5;

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SendTxResponse {
    hash?: string;
    txHash?: string;
    transactionHash?: string;
    error?: string;
    message?: string;
    code?: string;
}

async function main() {
    console.log("==============================================================");
    console.log("🔑 CẤP QUYỀN MINTER_ROLE QUA IBN GATEWAY (CHAIN PRODUCTION)");
    console.log("==============================================================");

    if (!IBN_ACCOUNT_ID || !IBN_API_KEY) {
        throw new Error(
            "❌ THIẾU BIẾN MÔI TRƯỜNG: Vui lòng cấu hình IBN_ACCOUNT_ID và IBN_API_KEY trong ./backend/.env hoặc ./.env"
        );
    }

    console.log(`📡 Gateway Base URL:   ${BASE_URL}`);
    console.log(`🔗 Target Chain:       ${CHAIN} (Chain ID: 2025)`);
    console.log(`🔑 Account ID:         ${IBN_ACCOUNT_ID}`);
    console.log(`🪙 RewardToken:        ${REWARD_TOKEN_ADDRESS}`);
    console.log(`🏛️ RewardManager:      ${REWARD_MANAGER_ADDRESS}`);

    // Đọc ABI RewardToken
    const tokenArtifactPath = path.join(
        process.cwd(),
        "artifacts/contracts/RewardToken.sol/RewardToken.json"
    );

    if (!fs.existsSync(tokenArtifactPath)) {
        throw new Error("❌ Không tìm thấy artifact RewardToken.json!");
    }

    const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, "utf-8"));
    const tokenInterface = new ethers.Interface(tokenArtifact.abi);

    // Tính MINTER_ROLE hash
    const minterRole = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const calldata = tokenInterface.encodeFunctionData("grantRole", [
        minterRole,
        REWARD_MANAGER_ADDRESS
    ]);

    console.log(`\n⚙️  MINTER_ROLE Hash: ${minterRole}`);
    console.log(`⚙️  Calldata:         ${calldata}`);

    // Gửi yêu cầu qua POST /api/accounts/{accountId}/send-tx
    let attempt = 0;
    let success = false;
    let txHash: string | null = null;

    while (attempt < MAX_RETRIES && !success) {
        attempt++;
        console.log(`\n⏳ [Lần thử ${attempt}/${MAX_RETRIES}] Đang gửi giao dịch grantRole qua Gateway send-tx...`);

        try {
            const sendTxPayload: Record<string, any> = {
                to: REWARD_TOKEN_ADDRESS,
                data: calldata,
                gasLimit: 300000
            };

            const response = await fetch(`${BASE_URL}/api/accounts/${IBN_ACCOUNT_ID}/send-tx`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": IBN_API_KEY!
                },
                body: JSON.stringify(sendTxPayload)
            });

            const body = (await response.json()) as SendTxResponse;

            if (response.ok || response.status === 200 || response.status === 202) {
                txHash = body.hash || body.txHash || body.transactionHash || null;
                success = true;
                console.log("✅ CẤP QUYỀN MINTER_ROLE THÀNH CÔNG TRÊN CHAIN PRODUCTION!");
                console.log(`   🧾 Mã giao dịch (txHash): ${txHash || JSON.stringify(body)}`);
                break;
            } else {
                console.warn(
                    `   ⚠️ Gateway phản hồi HTTP ${response.status} (${body.code || ""}): ${
                        body.error || body.message || JSON.stringify(body)
                    }`
                );
                if (attempt < MAX_RETRIES) {
                    const waitSec = attempt * 4;
                    console.log(`   ⏱️ Đợi ${waitSec}s rồi thử lại...`);
                    await sleep(waitSec * 1000);
                }
            }
        } catch (fetchErr: any) {
            console.warn(`   ⚠️ Lỗi kết nối mạng: ${fetchErr.message}`);
            if (attempt < MAX_RETRIES) {
                const waitSec = attempt * 4;
                await sleep(waitSec * 1000);
            }
        }
    }

    if (!success) {
        console.error(
            "\n❌ Chưa thể cấp quyền MINTER_ROLE lúc này do node Gateway đang xử lý chậm (lỗi 502 request timeout)."
        );
        console.log("👉 Bạn có thể chạy lại script này sau khi hệ thống node của trường rảnh rỗi:");
        console.log("   npx tsx scripts/grantMinterIBN.ts\n");
        return;
    }

    // Cập nhật deployments/production.json
    const prodDeploymentPath = path.join(process.cwd(), "deployments/production.json");
    if (fs.existsSync(prodDeploymentPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(prodDeploymentPath, "utf-8"));
            data.minterRoleGrant = {
                status: "SUCCESS_SUBMITTED",
                txHash: txHash,
                grantedAt: new Date().toISOString()
            };
            fs.writeFileSync(prodDeploymentPath, JSON.stringify(data, null, 2), "utf-8");
            console.log("📄 Đã cập nhật trạng thái cấp quyền vào deployments/production.json!");
        } catch (e) {
            // ignore
        }
    }
}

main().catch((err) => {
    console.error("❌ Lỗi thực thi:", err.message);
    process.exit(1);
});
