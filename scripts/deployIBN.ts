import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { ethers } from "ethers";

const require = createRequire(import.meta.url);
const dotenvPath = path.resolve(process.cwd(), "backend/node_modules/dotenv");
const dotenv = require(dotenvPath);

// 1. Nạp biến môi trường từ ./backend/.env (fallback ./env)
let envLoaded = dotenv.config({ path: "./backend/.env" });
if (envLoaded.error) {
    dotenv.config({ path: "./.env" });
}

const { IBN_ACCOUNT_ID, IBN_API_KEY } = process.env;
const BASE_URL = process.env.IBN_BASE_URL || "https://ibn.ictu.edu.vn";
const CHAIN = "production"; // Mạng chính thức IBN (Chain ID: 2025)
const CHAIN_ID = 2025;
const BLOCK_WAIT_MS = 8000; // Block time production ~2s, chờ 8s đảm bảo đã đào vào khối
const MAX_RETRIES = 3;
const DEFAULT_GAS_LIMIT = 3500000;

interface DeployResponse {
    hash: string;
    contractAddress: string;
    nonce?: number;
    chain?: string;
    gasLimit?: string;
    status?: string;
    error?: string;
    message?: string;
    code?: string;
}

interface SendTxResponse {
    hash?: string;
    txHash?: string;
    transactionHash?: string;
    error?: string;
    message?: string;
    code?: string;
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hàm deploy contract có cơ chế Retry & Tối ưu Payload theo đúng Spec 18:
 * - Khi không có constructor args: Không gửi constructorArgs hay abi dư thừa.
 * - Khi simulation bị 'request timeout': Tự động thử lại với explicit gasLimit để bỏ qua eth_estimateGas.
 */
async function deployContractWithRetry(params: {
    contractName: string;
    bytecode: string;
    abi?: any[];
    constructorArgs?: any[];
}): Promise<DeployResponse> {
    const { contractName, bytecode, abi, constructorArgs } = params;
    let attempt = 0;
    let lastError: any = null;

    while (attempt < MAX_RETRIES) {
        attempt++;
        console.log(`\n⏳ [Lần thử ${attempt}/${MAX_RETRIES}] Đang gửi yêu cầu Deploy ${contractName}...`);

        // Xây dựng payload chuẩn theo Spec:
        // - abi và constructorArgs chỉ gửi khi contract có tham số khởi tạo
        // - Lần 1: Không gửi gasLimit để Gateway estimate nếu có thể
        // - Lần retry (hoặc khi gặp timeout): Gửi explicit gasLimit để tránh treo simulation
        const payload: Record<string, any> = {
            accountId: IBN_ACCOUNT_ID,
            chain: CHAIN,
            bytecode: bytecode
        };

        if (constructorArgs && constructorArgs.length > 0) {
            payload.abi = abi;
            payload.constructorArgs = constructorArgs;
        }

        if (attempt > 1) {
            payload.gasLimit = DEFAULT_GAS_LIMIT;
            console.log(`   ⚙️  [Fallback] Đính kèm gasLimit: ${DEFAULT_GAS_LIMIT} để bỏ qua bước mô phỏng node`);
        }

        try {
            const res = await fetch(`${BASE_URL}/api/contracts/deploy`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-Key": IBN_API_KEY!
                },
                body: JSON.stringify(payload)
            });

            const body = (await res.json()) as DeployResponse;

            if (res.status === 202) {
                console.log(`✅ ${contractName} đã được Gateway tiếp nhận thành công!`);
                console.log(`   📍 Địa chỉ Contract: ${body.contractAddress}`);
                console.log(`   🧾 Mã giao dịch:     ${body.hash}`);
                return body;
            }

            // Gặp lỗi phản hồi từ Gateway
            const errorMsg = body.error || body.message || JSON.stringify(body);
            lastError = new Error(`HTTP ${res.status} ${body.code || ""}: ${errorMsg}`);

            const isTimeoutError =
                errorMsg.includes("timeout") ||
                res.status === 502 ||
                res.status === 429 ||
                body.code === "DEPLOY_BROADCAST_FAILED" ||
                body.code === "DEPLOY_SIMULATION_FAILED";

            if (isTimeoutError && attempt < MAX_RETRIES) {
                const backoffMs = attempt * 4000;
                console.warn(`   ⚠️ Node IBN phản hồi chậm (${errorMsg}). Tạm nghỉ ${backoffMs / 1000}s rồi thử lại...`);
                await sleep(backoffMs);
                continue;
            } else {
                throw lastError;
            }
        } catch (fetchErr: any) {
            lastError = fetchErr;
            if (attempt < MAX_RETRIES) {
                const backoffMs = attempt * 4000;
                console.warn(`   ⚠️ Lỗi kết nối mạng: ${fetchErr.message}. Tạm nghỉ ${backoffMs / 1000}s rồi thử lại...`);
                await sleep(backoffMs);
            } else {
                throw lastError;
            }
        }
    }

    throw lastError;
}

async function main() {
    console.log("======================================================");
    console.log("🚀 BẮT ĐẦU DEPLOY SMART CONTRACTS LÊN IBN (PRODUCTION)");
    console.log("======================================================");

    if (!IBN_ACCOUNT_ID || !IBN_API_KEY) {
        throw new Error(
            "❌ THIẾU BIẾN MÔI TRƯỜNG: Vui lòng cấu hình IBN_ACCOUNT_ID và IBN_API_KEY trong ./backend/.env hoặc ./.env"
        );
    }

    console.log(`📡 Gateway Base URL: ${BASE_URL}`);
    console.log(`🔗 Target Chain:     ${CHAIN} (Chain ID: ${CHAIN_ID}, EVM London)`);
    console.log(`🔑 Account ID:       ${IBN_ACCOUNT_ID}`);
    console.log(`🛡️  API Key status:   [CONFIGURED - HIDDEN FOR SECURITY]`);

    // 2. Lấy bytecode và ABI từ thư mục artifacts/ (đã biên dịch chuẩn EVM london)
    const tokenArtifactPath = path.join(
        process.cwd(),
        "artifacts/contracts/RewardToken.sol/RewardToken.json"
    );
    const managerArtifactPath = path.join(
        process.cwd(),
        "artifacts/contracts/RewardManager.sol/RewardManager.json"
    );

    if (!fs.existsSync(tokenArtifactPath) || !fs.existsSync(managerArtifactPath)) {
        throw new Error(
            "❌ Không tìm thấy artifacts! Vui lòng chạy 'npx hardhat compile' trước khi deploy."
        );
    }

    const tokenArtifact = JSON.parse(fs.readFileSync(tokenArtifactPath, "utf-8"));
    const managerArtifact = JSON.parse(fs.readFileSync(managerArtifactPath, "utf-8"));

    console.log("\n📦 Đã tải Artifacts thành công:");
    console.log(`   - RewardToken:   ${tokenArtifact.abi.length} ABI entries, bytecode ${tokenArtifact.bytecode.length} chars`);
    console.log(`   - RewardManager: ${managerArtifact.abi.length} ABI entries, bytecode ${managerArtifact.bytecode.length} chars`);

    // 3. Deploy RewardToken lên chain production
    console.log("\n------------------------------------------------------");
    console.log(`[Bước 1/3] Deploy RewardToken lên chain ${CHAIN}...`);
    console.log("------------------------------------------------------");

    const tokenBody = await deployContractWithRetry({
        contractName: "RewardToken",
        bytecode: tokenArtifact.bytecode
    });

    const tokenAddress: string = tokenBody.contractAddress;
    const tokenTxHash: string = tokenBody.hash;

    console.log(`   ⏱️  Đang đợi ~${BLOCK_WAIT_MS / 1000}s để transaction được đào vào khối (block time ~2s)...`);
    await sleep(BLOCK_WAIT_MS);

    // 4. Deploy RewardManager lên chain production (truyền tokenAddress vào constructor)
    console.log("\n------------------------------------------------------");
    console.log(`[Bước 2/3] Deploy RewardManager lên chain ${CHAIN}...`);
    console.log(`   👉 Tham số Constructor (tokenAddress): ${tokenAddress}`);
    console.log("------------------------------------------------------");

    const managerBody = await deployContractWithRetry({
        contractName: "RewardManager",
        bytecode: managerArtifact.bytecode,
        abi: managerArtifact.abi,
        constructorArgs: [tokenAddress]
    });

    const managerAddress: string = managerBody.contractAddress;
    const managerTxHash: string = managerBody.hash;

    console.log(`   ⏱️  Đang đợi ~${BLOCK_WAIT_MS / 1000}s để transaction được đào vào khối...`);
    await sleep(BLOCK_WAIT_MS);

// 5. Cấp quyền MINTER_ROLE cho RewardManager thông qua POST /api/accounts/{id}/send-tx
console.log("\n------------------------------------------------------");
console.log("[Bước 3/3] Đang cấp quyền MINTER_ROLE cho RewardManager...");
console.log("------------------------------------------------------");

let roleGrantStatus = "PENDING";
let roleTxHash: string | null = null;

try {
    const tokenInterface = new ethers.Interface(tokenArtifact.abi);
    const minterRole = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const calldata = tokenInterface.encodeFunctionData("grantRole", [
        minterRole,
        managerAddress
    ]);

    console.log(`   ⚙️  Calldata gọi grantRole(MINTER_ROLE, ${managerAddress}):`);
    console.log(`      ${calldata}`);

    let sendTxAttempt = 0;
    while (sendTxAttempt < 3) {
        sendTxAttempt++;
        console.log(`   ⏳ [send-tx Lần ${sendTxAttempt}] Đang gửi giao dịch cấp quyền...`);

        const sendTxPayload: Record<string, any> = {
            to: tokenAddress,
            data: calldata,
            gasLimit: 300000
        };
        if (CHAIN !== "production") {
            sendTxPayload.chain = CHAIN;
        }

        const sendTxRes = await fetch(`${BASE_URL}/api/accounts/${IBN_ACCOUNT_ID}/send-tx`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": IBN_API_KEY!
            },
            body: JSON.stringify(sendTxPayload)
        });

        const sendTxBody = (await sendTxRes.json()) as SendTxResponse;
            if (sendTxRes.ok || sendTxRes.status === 202 || sendTxRes.status === 200) {
                roleTxHash = sendTxBody.hash || sendTxBody.txHash || sendTxBody.transactionHash || null;
                roleGrantStatus = "SUCCESS_SUBMITTED";
                console.log("✅ Yêu cầu cấp quyền MINTER_ROLE đã được gửi qua /api/accounts/{id}/send-tx!");
                console.log(`   🧾 Mã giao dịch cấp quyền: ${roleTxHash || JSON.stringify(sendTxBody)}`);
                break;
            } else {
                console.warn(`   ⚠️ send-tx phản hồi HTTP ${sendTxRes.status}:`, sendTxBody);
                if (sendTxAttempt < 3) {
                    await sleep(4000);
                } else {
                    roleGrantStatus = `FAILED_${sendTxRes.status}`;
                }
            }
        }
    } catch (roleErr: any) {
        roleGrantStatus = "ERROR";
        console.error("⚠️ Lỗi khi gọi send-tx cấp quyền MINTER_ROLE:", roleErr.message);
    }

    // 6. Lưu kết quả ra file deployments/production.json và cập nhật deployed-contracts.json
    fs.mkdirSync(path.join(process.cwd(), "deployments"), { recursive: true });
    const deploymentRecord = {
        chain: CHAIN,
        chainId: CHAIN_ID,
        deployedAt: new Date().toISOString(),
        accountId: IBN_ACCOUNT_ID,
        contracts: {
            RewardToken: {
                address: tokenAddress,
                txHash: tokenTxHash
            },
            RewardManager: {
                address: managerAddress,
                txHash: managerTxHash,
                constructorArgs: [tokenAddress]
            }
        },
        minterRoleGrant: {
            status: roleGrantStatus,
            txHash: roleTxHash
        }
    };

    const deploymentFilePath = path.join(process.cwd(), `deployments/${CHAIN}.json`);
    fs.writeFileSync(
        deploymentFilePath,
        JSON.stringify(deploymentRecord, null, 2),
        "utf-8"
    );

    // Cập nhật file deployed-contracts.json ở root
    const rootDeployedPath = path.join(process.cwd(), "deployed-contracts.json");
    fs.writeFileSync(
        rootDeployedPath,
        JSON.stringify(
            {
                network: `ibn-${CHAIN}`,
                chainId: CHAIN_ID,
                deployedAt: deploymentRecord.deployedAt,
                deployerAccountId: IBN_ACCOUNT_ID,
                contracts: {
                    RewardToken: tokenAddress,
                    RewardManager: managerAddress
                },
                transactions: {
                    RewardToken: tokenTxHash,
                    RewardManager: managerTxHash,
                    grantMinterRole: roleTxHash
                }
            },
            null,
            2
        ),
        "utf-8"
    );

    console.log("\n======================================================");
    console.log(`🎉 TỔNG KẾT TRIỂN KHAI THÀNH CÔNG TRÊN CHAIN ${CHAIN.toUpperCase()}`);
    console.log("======================================================");
    console.log(`1. RewardToken:    ${tokenAddress}`);
    console.log(`2. RewardManager:  ${managerAddress}`);
    console.log(`3. Cấp MINTER_ROLE: Trạng thái [${roleGrantStatus}] (Tx: ${roleTxHash})`);
    console.log(`4. Đã lưu cấu hình tại:`);
    console.log(`   - ${deploymentFilePath}`);
    console.log(`   - deployed-contracts.json`);
    console.log("======================================================\n");
}

main().catch((err) => {
    console.error("\n❌ LỖI TRONG QUÁ TRÌNH DEPLOY:", err.message);
    process.exit(1);
});
