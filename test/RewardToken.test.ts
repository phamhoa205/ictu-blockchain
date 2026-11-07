import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

const LOCK_MSG = "ICTU_Token: Peer-to-peer transfer is locked";

describe("RewardToken", function () {

  // Fixture: triển khai token và cấp MINTER_ROLE cho admin
  async function deployTokenFixture() {
    const [admin, studentA, studentB] = await ethers.getSigners();

    const token = await ethers.deployContract("RewardToken");
    await token.waitForDeployment();

    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.grantRole(MINTER_ROLE, admin.address);

    return { token, admin, studentA, studentB, MINTER_ROLE };
  }

  async function deployTokenWithBalanceFixture() {
    const ctx = await deployTokenFixture();
    await ctx.token.connect(ctx.admin).mint(ctx.studentA.address, 100n);
    return ctx;
  }

  // =========================================================
  // KỊCH BẢN GỐC (giữ nguyên hành vi)
  // =========================================================

  it("[TC-01] Should deploy token correctly", async function () {
    const token = await ethers.deployContract("RewardToken");
    await token.waitForDeployment();

    expect(await token.name()).to.equal("ICTU Reward Token");
    expect(await token.symbol()).to.equal("ICTU");
    expect(await token.transferLocked()).to.equal(true);
  });

  it("[TC-02] Minter can mint token", async function () {
    const { token, admin, studentA } =
      await networkHelpers.loadFixture(deployTokenFixture);

    await token.connect(admin).mint(studentA.address, 100n);

    expect(await token.balanceOf(studentA.address)).to.equal(100n);
  });

  it("[TC-03] Non owner cannot mint token", async function () {
    const { token, studentA, MINTER_ROLE } =
      await networkHelpers.loadFixture(deployTokenFixture);

    await expect(
      token.connect(studentA).mint(studentA.address, 100n)
    ).to.be.revert(ethers);

    await expect(
      token.connect(studentA).mint(studentA.address, 100n)
    )
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(studentA.address, MINTER_ROLE);
  });

  // =========================================================
  // KỊCH BẢN MỚI: SOULBOUND ERC-20
  // =========================================================

  it("[TC-07] Blocks peer-to-peer transfer while transferLocked = true", async function () {
    const { token, studentA, studentB } =
      await networkHelpers.loadFixture(deployTokenWithBalanceFixture);

    // Đường 1: transfer trực tiếp
    await expect(
      token.connect(studentA).transfer(studentB.address, 10n)
    ).to.be.revertedWith(LOCK_MSG);

    // Đường 2: approve + transferFrom (thử né cơ chế khóa qua bên thứ ba)
    await token.connect(studentA).approve(studentB.address, 10n);
    await expect(
      token.connect(studentB).transferFrom(studentA.address, studentB.address, 10n)
    ).to.be.revertedWith(LOCK_MSG);

    expect(await token.balanceOf(studentA.address)).to.equal(100n);
    expect(await token.balanceOf(studentB.address)).to.equal(0n);
  });

  it("[TC-08] Allows student to burn (redeem) tokens even while transfer is locked", async function () {
    const { token, studentA } =
      await networkHelpers.loadFixture(deployTokenWithBalanceFixture);

    expect(await token.transferLocked()).to.equal(true);

    await expect(token.connect(studentA).burn(30n))
      .to.emit(token, "Transfer")
      .withArgs(studentA.address, ethers.ZeroAddress, 30n);

    expect(await token.balanceOf(studentA.address)).to.equal(70n);
    expect(await token.totalSupply()).to.equal(70n);
  });

  it("[TC-09] Admin unlocks transfers via setTransferLock(false) and P2P transfer works", async function () {
    const { token, admin, studentA, studentB } =
      await networkHelpers.loadFixture(deployTokenWithBalanceFixture);

    // Người không phải Admin không được đổi trạng thái khóa
    await expect(
      token.connect(studentA).setTransferLock(false)
    ).to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount");

    await expect(token.connect(admin).setTransferLock(false))
      .to.emit(token, "TransferLockUpdated")
      .withArgs(false, admin.address);

    expect(await token.transferLocked()).to.equal(false);

    await token.connect(studentA).transfer(studentB.address, 40n);

    expect(await token.balanceOf(studentA.address)).to.equal(60n);
    expect(await token.balanceOf(studentB.address)).to.equal(40n);
  });
});