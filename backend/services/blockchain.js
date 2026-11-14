const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config(); // fallback current dir
const { ethers } = require("ethers");
const db = require("../database/database");

// Contract addresses
const rewardTokenAddress =
  process.env.REWARD_TOKEN_ADDRESS ||
  "0x8fAAB493059E219255CeA538C4678Bd52C14788b";

const rewardManagerAddress =
  process.env.REWARD_MANAGER_ADDRESS ||
  "0x76B4E34AD84A0c64c1810dfed493a033fcD15436";

// IBN Gateway configuration
const ibnAccountId = process.env.IBN_ACCOUNT_ID;
const ibnApiKey = process.env.IBN_API_KEY;
const ibnBaseUrl = process.env.IBN_BASE_URL || "https://ibn.ictu.edu.vn";
const isIbnGatewayMode = Boolean(ibnAccountId && ibnApiKey);

// Fallback JSON-RPC provider & admin wallet (chỉ khởi tạo khi KHÔNG dùng IBN Gateway)
let provider = null;
let wallet = null;

if (!isIbnGatewayMode && process.env.RPC_URL) {
  try {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
    provider = new ethers.JsonRpcProvider(rpcUrl);
    const privateKey =
      process.env.ADMIN_PRIVATE_KEY ||
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    wallet = new ethers.Wallet(privateKey, provider);
  } catch (e) {
    // Provider initialized lazily
  }
}

// ABI
const RewardToken = require("../contracts/RewardToken.json");
const RewardManager = require("../contracts/RewardManager.json");

const tokenInterface = new ethers.Interface(RewardToken.abi);
const managerInterface = new ethers.Interface(RewardManager.abi);

// Raw ethers contracts (dùng cho chế độ Local RPC)
let rawTokenContract = null;
let rawManagerContract = null;
if (wallet && provider) {
  try {
    rawTokenContract = new ethers.Contract(rewardTokenAddress, RewardToken.abi, wallet);
    rawManagerContract = new ethers.Contract(rewardManagerAddress, RewardManager.abi, wallet);
  } catch (e) {}
}

/**
 * Gửi giao dịch ghi qua IBN Gateway Custodial API:
 * POST /api/accounts/{accountId}/send-tx
 */
async function sendIbnTx(to, data, gasLimit = 350000) {
  if (!ibnAccountId || !ibnApiKey) {
    throw new Error("Chưa cấu hình IBN_ACCOUNT_ID hoặc IBN_API_KEY trong .env");
  }

  const payload = {
    to,
    data,
    gasLimit
  };

  const response = await fetch(`${ibnBaseUrl}/api/accounts/${ibnAccountId}/send-tx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": ibnApiKey
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json();

  if (!response.ok && response.status !== 200 && response.status !== 202) {
    throw new Error(
      `IBN Gateway send-tx thất bại (HTTP ${response.status} ${body.code || ""}): ${
        body.error || body.message || JSON.stringify(body)
      }`
    );
  }

  const txHash = body.hash || body.txHash || body.transactionHash;

  return {
    hash: txHash,
    wait: async () => ({
      blockNumber: body.blockNumber || 1,
      gasUsed: body.gasUsed ? BigInt(body.gasUsed) : BigInt(100000),
      transactionHash: txHash
    })
  };
}

/**
 * Chuyển đổi an toàn giá trị amount từ Wei về đơn vị token:
 * Nếu amount >= 10^14 (lưu dạng 18 decimals trên ERC-20), dùng formatUnits(amount, 18).
 * Nếu amount nhỏ hơn, đây là số nguyên token thông thường.
 */
function parseRewardAmount(rawAmount) {
  if (rawAmount === null || rawAmount === undefined) return 0;
  try {
    const rawBig = BigInt(rawAmount.toString());
    if (rawBig >= BigInt(10 ** 14)) {
      const formatted = ethers.formatUnits(rawBig, 18);
      return Math.round(Number(formatted));
    }
    return Number(rawBig);
  } catch (e) {
    return Number(rawAmount) || 0;
  }
}

/**
 * Đọc số dư token của sinh viên:
 * 1. Thử gọi API Gateway /api/contracts/RewardToken/call
 * 2. Thử gọi RPC node nếu có
 * 3. Fallback sang tính tổng token từ lịch sử bảng rewards trong SQLite (đã tự động đồng bộ từ IBN)
 */
async function getStudentBalance(studentAddress) {
  const cleanAddress = ethers.getAddress(studentAddress.trim().toLowerCase());

  // Cách 1: Thử gọi IBN Gateway đọc contract nếu có
  if (isIbnGatewayMode) {
    try {
      const res = await fetch(`${ibnBaseUrl}/api/contracts/RewardToken/call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": ibnApiKey
        },
        body: JSON.stringify({
          method: "balanceOf",
          args: [cleanAddress]
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.result !== undefined) {
          const parsed = parseRewardAmount(data.result);
          return BigInt(parsed);
        }
      }
    } catch (gatewayErr) {
      // Gateway chưa đăng ký contract name -> chuyển sang fallback
    }
  }

  // Cách 2: Thử đọc từ JSON-RPC nếu provider kết nối được
  if (rawTokenContract && !isIbnGatewayMode) {
    try {
      const bal = await rawTokenContract.balanceOf(cleanAddress);
      return BigInt(parseRewardAmount(bal));
    } catch (rpcErr) {
      // RPC không phản hồi -> chuyển sang fallback SQLite
    }
  }

  // Cách 3: Fallback đồng bộ từ SQLite (tổng các lượt khen thưởng hợp lệ)
  return new Promise((resolve) => {
    db.get(
      `SELECT COALESCE(SUM(amount), 0) AS totalBalance FROM rewards WHERE LOWER(student) = LOWER(?)`,
      [cleanAddress],
      (err, row) => {
        if (err || !row) {
          return resolve(BigInt(0));
        }
        resolve(BigInt(row.totalBalance || 0));
      }
    );
  });
}

// ========================================================
// Smart Contract Adapter tương thích 100% với backend routes
// ========================================================

const managerContract = {
  // 1. Cấp thưởng trực tiếp
  issueReward: async (studentWallet, amount, reason) => {
    if (isIbnGatewayMode) {
      const data = managerInterface.encodeFunctionData("issueReward", [
        studentWallet,
        amount,
        reason
      ]);
      return await sendIbnTx(rewardManagerAddress, data, 350000);
    } else if (rawManagerContract) {
      return await rawManagerContract.issueReward(studentWallet, amount, reason);
    } else {
      throw new Error("Không có kết nối Blockchain (cần IBN Gateway hoặc Local RPC)");
    }
  },

  // 2. Phê duyệt đề xuất khen thưởng
  approveProposal: async (proposalId) => {
    if (isIbnGatewayMode) {
      const data = managerInterface.encodeFunctionData("approveProposal", [proposalId]);
      return await sendIbnTx(rewardManagerAddress, data, 350000);
    } else if (rawManagerContract) {
      return await rawManagerContract.approveProposal(proposalId);
    } else {
      throw new Error("Không có kết nối Blockchain");
    }
  },

  // 3. Tạo đề xuất khen thưởng On-chain
  createProposal: async (studentWallet, amount, reason) => {
    if (isIbnGatewayMode) {
      const data = managerInterface.encodeFunctionData("createProposal", [
        studentWallet,
        amount,
        reason
      ]);
      return await sendIbnTx(rewardManagerAddress, data, 350000);
    } else if (rawManagerContract) {
      return await rawManagerContract.createProposal(studentWallet, amount, reason);
    } else {
      throw new Error("Không có kết nối Blockchain");
    }
  },

  // 4. Phát thưởng hàng loạt (Batch Mint)
  batchIssueReward: async (students, amounts, evidenceHash) => {
    if (isIbnGatewayMode) {
      const data = managerInterface.encodeFunctionData("batchIssueReward", [
        students,
        amounts,
        evidenceHash
      ]);
      return await sendIbnTx(rewardManagerAddress, data, 1000000);
    } else if (rawManagerContract) {
      return await rawManagerContract.batchIssueReward(students, amounts, evidenceHash);
    } else {
      throw new Error("Không có kết nối Blockchain");
    }
  }
};

const tokenContract = {
  // 1. Kiểm tra số dư token
  balanceOf: async (studentWallet) => {
    return await getStudentBalance(studentWallet);
  },

  // 2. Tên và ký hiệu token
  name: async () => "ICTU Reward Token",
  symbol: async () => "ICTU",

  // 3. Đúc token
  mint: async (studentWallet, amount) => {
    if (isIbnGatewayMode) {
      const data = tokenInterface.encodeFunctionData("mint", [studentWallet, amount]);
      return await sendIbnTx(rewardTokenAddress, data, 300000);
    } else if (rawTokenContract) {
      return await rawTokenContract.mint(studentWallet, amount);
    } else {
      throw new Error("Không có kết nối Blockchain");
    }
  },

  // 4. Cấp quyền Role
  grantRole: async (role, account) => {
    if (isIbnGatewayMode) {
      const data = tokenInterface.encodeFunctionData("grantRole", [role, account]);
      return await sendIbnTx(rewardTokenAddress, data, 300000);
    } else if (rawTokenContract) {
      return await rawTokenContract.grantRole(role, account);
    } else {
      throw new Error("Không có kết nối Blockchain");
    }
  }
};

/**
 * Kiểm tra trạng thái kết nối hệ thống
 */
async function checkConnection() {
  if (isIbnGatewayMode) {
    let gatewayOnline = false;
    try {
      const ping = await fetch(`${ibnBaseUrl}/api/dashboard/stats`, {
        headers: { "X-API-Key": ibnApiKey }
      });
      gatewayOnline = ping.ok;
    } catch (e) {
      gatewayOnline = false;
    }

    return {
      connected: gatewayOnline,
      mode: "IBN_GATEWAY",
      network: "ibn-production",
      chainId: "2025",
      gatewayUrl: ibnBaseUrl,
      accountId: ibnAccountId,
      tokenAddress: rewardTokenAddress,
      managerAddress: rewardManagerAddress
    };
  }

  // Chế độ Local Node
  if (provider) {
    try {
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      return {
        connected: true,
        mode: "LOCAL_RPC",
        chainId: network.chainId.toString(),
        blockNumber,
        adminAddress: wallet ? wallet.address : null,
        tokenAddress: rewardTokenAddress,
        managerAddress: rewardManagerAddress
      };
    } catch (error) {
      return {
        connected: false,
        mode: "LOCAL_RPC",
        error: error.message
      };
    }
  }

  return {
    connected: false,
    mode: "DISCONNECTED",
    tokenAddress: rewardTokenAddress,
    managerAddress: rewardManagerAddress
  };
}

/**
 * Tự động đồng bộ lịch sử giao dịch từ IBN Gateway (Auto Re-indexing):
 * Gọi API GET /api/accounts/{accountId}/transactions để lấy toàn bộ lịch sử on-chain,
 * giải mã calldata gửi tới RewardManager và nạp lại vào bảng `rewards` trong SQLite.
 */
async function syncTransactionsFromIBN() {
  if (!isIbnGatewayMode) {
    console.log("ℹ️ [IBN Auto-Sync] Bỏ qua đồng bộ on-chain (chưa cấu hình IBN_ACCOUNT_ID / IBN_API_KEY).");
    return { success: false, syncedCount: 0, reason: "NOT_IN_GATEWAY_MODE" };
  }

  console.log(`📡 [IBN Auto-Sync] Bắt đầu đồng bộ lịch sử giao dịch từ IBN Gateway (${ibnBaseUrl})...`);

  try {
    const endpoint = `${ibnBaseUrl}/api/accounts/${ibnAccountId}/transactions?limit=200`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "X-API-Key": ibnApiKey,
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      console.warn(`⚠️ [IBN Auto-Sync] IBN Gateway phản hồi HTTP ${status}: ${text.slice(0, 200)}`);
      return { success: false, syncedCount: 0, error: `HTTP ${status}` };
    }

    const body = await response.json();
    let txList = [];
    if (Array.isArray(body)) {
      txList = body;
    } else if (body && Array.isArray(body.transactions)) {
      txList = body.transactions;
    } else if (body && Array.isArray(body.data)) {
      txList = body.data;
    } else if (body && Array.isArray(body.items)) {
      txList = body.items;
    }

    if (!txList || txList.length === 0) {
      console.log("ℹ️ [IBN Auto-Sync] Không tìm thấy giao dịch nào từ tài khoản IBN.");
      return { success: true, syncedCount: 0 };
    }

    const targetManager = (rewardManagerAddress || "").toLowerCase();
    let syncedCount = 0;

    for (const tx of txList) {
      try {
        const toAddress = (tx.to || tx.recipient || tx.contractAddress || "").toLowerCase();
        
        // Chỉ xử lý các giao dịch gửi tới hợp đồng RewardManager
        if (targetManager && toAddress !== targetManager) {
          continue;
        }

        // Bỏ qua các giao dịch thất bại rõ ràng
        const txStatus = tx.status !== undefined ? String(tx.status).toLowerCase() : "";
        if (txStatus === "failed" || txStatus === "reverted" || txStatus === "0") {
          continue;
        }

        const calldata = tx.data || tx.input || tx.calldata;
        if (!calldata || calldata === "0x" || calldata.length < 10) {
          continue;
        }

        const txHash = tx.hash || tx.txHash || tx.transactionHash || tx.id;
        const txDate = tx.createdAt || tx.timestamp || tx.blockTimestamp || new Date().toISOString();

        // 1. Giải mã giao dịch qua Interface của RewardManager
        let parsed = null;
        try {
          parsed = managerInterface.parseTransaction({ data: calldata, value: tx.value || 0 });
        } catch (_) {
          // Calldata không khớp ABI RewardManager
        }

        if (parsed) {
          const fnName = parsed.name;
          const args = parsed.args;

          if (fnName === "issueReward") {
            const studentWallet = ethers.getAddress(args[0]);
            const amount = parseRewardAmount(args[1]);
            const reason = args[2] || "Khen thưởng học tập (On-chain)";

            const inserted = await insertRewardRecord(studentWallet, amount, reason, txHash, txDate);
            if (inserted) syncedCount++;
          } else if (fnName === "issueRewardWithHash") {
            const studentWallet = ethers.getAddress(args[0]);
            const amount = parseRewardAmount(args[1]);
            const reasonHash = String(args[2]);
            const reason = `Khen thưởng sinh viên (Minh chứng: ${reasonHash.slice(0, 10)}...)`;

            const inserted = await insertRewardRecord(studentWallet, amount, reason, txHash, txDate);
            if (inserted) syncedCount++;
          } else if (fnName === "batchIssueReward") {
            const students = args[0];
            const amounts = args[1];
            const batchEvidenceHash = String(args[2]);
            const reason = `Khen thưởng theo lô (Minh chứng: ${batchEvidenceHash.slice(0, 10)}...)`;

            if (Array.isArray(students) && Array.isArray(amounts)) {
              for (let i = 0; i < students.length; i++) {
                const sWallet = ethers.getAddress(students[i]);
                const sAmount = parseRewardAmount(amounts[i]);
                const inserted = await insertRewardRecord(sWallet, sAmount, reason, txHash, txDate);
                if (inserted) syncedCount++;
              }
            }
          } else if (fnName === "approveProposal") {
            const proposalId = Number(args[0]);
            const proposal = await getProposalById(proposalId);
            if (proposal) {
              const studentWallet = ethers.getAddress(proposal.studentWallet);
              const amount = parseRewardAmount(proposal.amount);
              const reason = proposal.reason || `Phê duyệt đề xuất #${proposalId}`;
              const inserted = await insertRewardRecord(
                studentWallet, 
                amount, 
                reason, 
                txHash, 
                txDate,
                proposal.evidence_name || null,
                proposal.evidence_hash || null,
                proposal.evidence_data || null
              );
              if (inserted) syncedCount++;
            }
          }
        }

        // 2. Nếu có event logs trong tx, parse thêm RewardIssued event
        if (tx.logs && Array.isArray(tx.logs)) {
          for (const log of tx.logs) {
            try {
              const parsedLog = managerInterface.parseLog(log);
              if (parsedLog && parsedLog.name === "RewardIssued") {
                const studentWallet = ethers.getAddress(parsedLog.args.student);
                const amount = parseRewardAmount(parsedLog.args.amount);
                const reason = parsedLog.args.reason || "Khen thưởng học tập (On-chain)";
                const inserted = await insertRewardRecord(studentWallet, amount, reason, txHash, txDate);
                if (inserted) syncedCount++;
              }
            } catch (_) {}
          }
        }
      } catch (itemErr) {
        console.warn(`⚠️ [IBN Auto-Sync] Bỏ qua giao dịch ${tx.hash || "unknown"}:`, itemErr.message);
      }
    }

    console.log(`✅ [IBN Auto-Sync] Hoàn tất đồng bộ: Đã thêm ${syncedCount} giao dịch mới vào CSDL SQLite.`);
    return { success: true, syncedCount };
  } catch (error) {
    console.warn("⚠️ [IBN Auto-Sync] Lỗi trong quá trình đồng bộ từ IBN Gateway:", error.message);
    return { success: false, syncedCount: 0, error: error.message };
  }
}

/**
 * Chèn an toàn bản ghi vào bảng rewards trong SQLite nếu chưa tồn tại
 */
function insertRewardRecord(studentWallet, amount, reason, txHash, createdAt, evidenceName = null, evidenceHash = null, evidenceData = null) {
  return new Promise((resolve) => {
    if (!studentWallet || !amount || amount <= 0 || !txHash) {
      return resolve(false);
    }

    db.get(
      `SELECT id FROM rewards WHERE LOWER(student) = LOWER(?) AND transactionHash = ?`,
      [studentWallet, txHash],
      (err, row) => {
        if (err || row) {
          // Đã tồn tại hoặc lỗi đọc -> bỏ qua
          return resolve(false);
        }

        // Tự động kiểm tra và ánh xạ sinh viên vào bảng students nếu chưa có
        db.get(
          `SELECT studentId FROM students WHERE LOWER(wallet) = LOWER(?)`,
          [studentWallet],
          (sErr, student) => {
            if (!student) {
              const autoId = `EXT_${studentWallet.slice(2, 8).toUpperCase()}`;
              const autoName = `Sinh viên (${studentWallet.slice(0, 6)}...${studentWallet.slice(-4)})`;
              db.run(
                `INSERT OR IGNORE INTO students (studentId, name, wallet, email) VALUES (?, ?, ?, ?)`,
                [autoId, autoName, studentWallet, `${autoId.toLowerCase()}@ictu.edu.vn`]
              );
            }

            db.run(
              `INSERT INTO rewards (student, amount, reason, transactionHash, evidence_name, evidence_hash, evidence_data, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [studentWallet, amount, reason, txHash, evidenceName, evidenceHash, evidenceData, createdAt || new Date().toISOString()],
              function (iErr) {
                if (iErr) {
                  return resolve(false);
                }
                resolve(true);
              }
            );
          }
        );
      }
    );
  });
}

function getProposalById(proposalId) {
  return new Promise((resolve) => {
    db.get(`SELECT * FROM proposals WHERE id = ?`, [proposalId], (err, row) => {
      if (err || !row) return resolve(null);
      resolve(row);
    });
  });
}

module.exports = {
  provider,
  wallet,
  tokenContract,
  managerContract,
  rewardTokenAddress,
  rewardManagerAddress,
  checkConnection,
  isIbnGatewayMode,
  parseRewardAmount,
  syncTransactionsFromIBN
};
