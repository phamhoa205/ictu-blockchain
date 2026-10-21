require("dotenv").config();
const { ethers } = require("ethers");

const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:8545";
const provider = new ethers.JsonRpcProvider(rpcUrl);

// Admin account (Hardhat Account #0 default)
const privateKey =
  process.env.ADMIN_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const wallet = new ethers.Wallet(privateKey, provider);

// Contract addresses
const rewardTokenAddress =
  process.env.REWARD_TOKEN_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const rewardManagerAddress =
  process.env.REWARD_MANAGER_ADDRESS ||
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// ABI
const RewardToken = require("../contracts/RewardToken.json");
const RewardManager = require("../contracts/RewardManager.json");

const tokenContract = new ethers.Contract(
  rewardTokenAddress,
  RewardToken.abi,
  wallet
);

const managerContract = new ethers.Contract(
  rewardManagerAddress,
  RewardManager.abi,
  wallet
);

async function checkConnection() {
  try {
    const network = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    return {
      connected: true,
      chainId: network.chainId.toString(),
      blockNumber,
      adminAddress: wallet.address,
      tokenAddress: rewardTokenAddress,
      managerAddress: rewardManagerAddress
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = {
  provider,
  wallet,
  tokenContract,
  managerContract,
  rewardTokenAddress,
  rewardManagerAddress,
  checkConnection
};