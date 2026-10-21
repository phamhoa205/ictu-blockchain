import { network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
    const { ethers } = await network.connect();

    let tokenAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    let managerAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

    const deployedPath = path.join(__dirname, "..", "deployed-contracts.json");
    if (fs.existsSync(deployedPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(deployedPath, "utf-8"));
            if (data.contracts && data.contracts.RewardToken) {
                tokenAddress = data.contracts.RewardToken;
                managerAddress = data.contracts.RewardManager;
            }
        } catch (e) {
            // fallback to default
        }
    }

    const token = await ethers.getContractAt("RewardToken", tokenAddress);
    const MINTER_ROLE = await token.MINTER_ROLE();

    const hasRole = await token.hasRole(MINTER_ROLE, managerAddress);
    if (hasRole) {
        console.log("RewardManager already has MINTER_ROLE:", managerAddress);
    } else {
        const tx = await token.grantRole(MINTER_ROLE, managerAddress);
        await tx.wait();
        console.log("Granted MINTER_ROLE to:", managerAddress);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});