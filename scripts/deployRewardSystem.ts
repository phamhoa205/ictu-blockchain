import { network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
    console.log("==========================================");
    console.log("🚀 DEPLOYING ICTU BLOCKCHAIN REWARD SYSTEM");
    console.log("==========================================");

    const { ethers } = await network.connect();
    const [deployer] = await ethers.getSigners();

    console.log("Deployer address:", deployer.address);
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

    // 1. Deploy RewardToken
    console.log("\n[1/3] Deploying RewardToken (ERC-20)...");
    const RewardTokenFactory = await ethers.getContractFactory("RewardToken");
    const token = await RewardTokenFactory.deploy();
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    console.log("✅ RewardToken deployed at:", tokenAddress);

    // 2. Deploy RewardManager
    console.log("\n[2/3] Deploying RewardManager...");
    const RewardManagerFactory = await ethers.getContractFactory("RewardManager");
    const manager = await RewardManagerFactory.deploy(tokenAddress);
    await manager.waitForDeployment();
    const managerAddress = await manager.getAddress();
    console.log("✅ RewardManager deployed at:", managerAddress);

    // 3. Grant MINTER_ROLE to RewardManager
    console.log("\n[3/3] Granting MINTER_ROLE to RewardManager...");
    const MINTER_ROLE = await token.MINTER_ROLE();
    const grantTx = await token.grantRole(MINTER_ROLE, managerAddress);
    await grantTx.wait();
    console.log("✅ Granted MINTER_ROLE to:", managerAddress);

    // 4. Save deployed configuration
    const deploymentData = {
        network: "localhost",
        deployedAt: new Date().toISOString(),
        deployer: deployer.address,
        contracts: {
            RewardToken: tokenAddress,
            RewardManager: managerAddress
        }
    };

    const outPath = path.join(process.cwd(), "deployed-contracts.json");
    fs.writeFileSync(outPath, JSON.stringify(deploymentData, null, 2));
    console.log(`\n📄 Deployment info saved to: ${outPath}`);

    // Update backend .env if it exists
    const backendEnvPath = path.join(process.cwd(), "backend", ".env");
    if (fs.existsSync(backendEnvPath)) {
        let envContent = fs.readFileSync(backendEnvPath, "utf-8");
        envContent = envContent.replace(
            /REWARD_TOKEN_ADDRESS=.*/,
            `REWARD_TOKEN_ADDRESS=${tokenAddress}`
        );
        envContent = envContent.replace(
            /REWARD_MANAGER_ADDRESS=.*/,
            `REWARD_MANAGER_ADDRESS=${managerAddress}`
        );
        fs.writeFileSync(backendEnvPath, envContent);
        console.log("📄 Updated backend/.env with new contract addresses!");
    }

    console.log("\n==========================================");
    console.log("🎉 ALL CONTRACTS DEPLOYED & CONFIGURED!");
    console.log("==========================================");
}

main().catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exitCode = 1;
});