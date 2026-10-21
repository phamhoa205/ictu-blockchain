import { network } from "hardhat";

async function main() {
  const { ethers } = await network.connect();

  const RewardToken = await ethers.getContractFactory("RewardToken");

  const token = await RewardToken.deploy();

  await token.waitForDeployment();

  console.log(
    "RewardToken deployed at:",
    await token.getAddress()
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});