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
 * Đọc số dư token của sinh viên:
 * 1. Thử gọi API Gateway /api/contracts/RewardToken/call
 * 2. Thử gọi RPC node nếu có
 * 3. Fallback sang tính tổng token từ lịch sử bảng rewards trong SQLite
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
          return BigInt(data.result);
        }
      }
    } catch (gatewayErr) {
      // Gateway chưa đăng ký contract name -> chuyển sang fallback
    }
  }

  // Cách 2: Thử đọc từ JSON-RPC nếu provider kết nối được
  if (rawTokenContract && !isIbnGatewayMode) {
    try {
      return await rawTokenContract.balanceOf(cleanAddress);
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

module.exports = {
  provider,
  wallet,
  tokenContract,
  managerContract,
  rewardTokenAddress,
  rewardManagerAddress,
  checkConnection,
  isIbnGatewayMode
};
