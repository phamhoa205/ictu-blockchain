import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("RewardManager", function () {

  // Fixture: triển khai đầy đủ hệ thống như scripts/deployRewardSystem.ts
  async function deploySystemFixture() {
    const signers = await ethers.getSigners();
    const [admin, student, teacher, stranger] = signers;

    const token = await ethers.deployContract("RewardToken");
    await token.waitForDeployment();

    const manager = await ethers.deployContract("RewardManager", [
      await token.getAddress(),
    ]);
    await manager.waitForDeployment();

    // Cấp MINTER_ROLE cho RewardManager
    const MINTER_ROLE = await token.MINTER_ROLE();
    await token.grantRole(MINTER_ROLE, await manager.getAddress());

    // Cấp TEACHER_ROLE cho tài khoản giảng viên
    const TEACHER_ROLE = await manager.TEACHER_ROLE();
    await manager.grantRole(TEACHER_ROLE, teacher.address);

    return { token, manager, admin, student, teacher, stranger, signers, TEACHER_ROLE };
  }

  // =========================================================
  // KỊCH BẢN GỐC (giữ nguyên hành vi)
  // =========================================================

  it("[TC-04] Admin can issue reward", async function () {
    const { token, manager, student } =
      await networkHelpers.loadFixture(deploySystemFixture);

    await manager.issueReward(student.address, 100n, "Research Award");

    expect(await token.balanceOf(student.address)).to.equal(100n);
  });

  it("[TC-05] Should emit RewardIssued event", async function () {
    const { manager, student } =
      await networkHelpers.loadFixture(deploySystemFixture);

    await expect(manager.issueReward(student.address, 100n, "Research Award"))
      .to.emit(manager, "RewardIssued")
      .withArgs(student.address, 100n, "Research Award");
  });

  it("[TC-06] Non owner cannot issue reward", async function () {
    const { manager, student } =
      await networkHelpers.loadFixture(deploySystemFixture);

    await expect(
      manager.connect(student).issueReward(student.address, 100n, "Hack")
    ).to.be.revert(ethers);

    await expect(
      manager.connect(student).issueReward(student.address, 100n, "Hack")
    )
      .to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount")
      .withArgs(student.address, ethers.ZeroHash); // DEFAULT_ADMIN_ROLE = 0x00
  });

  // =========================================================
  // KỊCH BẢN MỚI: QUY TRÌNH ĐỀ XUẤT -> PHÊ DUYỆT ON-CHAIN
  // =========================================================

  it("[TC-10] Teacher (TEACHER_ROLE) creates an on-chain reward proposal", async function () {
    const { manager, student, teacher } =
      await networkHelpers.loadFixture(deploySystemFixture);

    const reason = "Giai Nhat Olympic Tin hoc cap Truong";

    await expect(
      manager.connect(teacher).createProposal(student.address, 50n, reason)
    )
      .to.emit(manager, "ProposalCreated")
      .withArgs(1n, teacher.address, student.address, 50n, reason);

    expect(await manager.proposalCount()).to.equal(1n);

    const p = await manager.getProposal(1n);
    expect(p.student).to.equal(student.address);
    expect(p.amount).to.equal(50n);
    expect(p.reason).to.equal(reason);
    expect(p.proposer).to.equal(teacher.address);
    expect(p.approved).to.equal(false);
    expect(p.rejected).to.equal(false);
  });

  it("[TC-11] Account without TEACHER_ROLE cannot create a proposal", async function () {
    const { manager, student, stranger, TEACHER_ROLE } =
      await networkHelpers.loadFixture(deploySystemFixture);

    await expect(
      manager.connect(stranger).createProposal(student.address, 50n, "Self-proposal")
    )
      .to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount")
      .withArgs(stranger.address, TEACHER_ROLE);

    expect(await manager.proposalCount()).to.equal(0n);
  });

  it("[TC-12] Admin approves proposal -> balance increases; double-approval is blocked", async function () {
    const { token, manager, admin, student, teacher } =
      await networkHelpers.loadFixture(deploySystemFixture);

    const reason = "Sinh vien 5 Tot";
    await manager.connect(teacher).createProposal(student.address, 80n, reason);

    // Giảng viên KHÔNG được tự phê duyệt đề xuất của mình
    await expect(
      manager.connect(teacher).approveProposal(1n)
    ).to.be.revertedWithCustomError(manager, "AccessControlUnauthorizedAccount");

    await expect(manager.connect(admin).approveProposal(1n))
      .to.emit(manager, "ProposalApproved")
      .withArgs(1n, admin.address, student.address, 80n)
      .and.to.emit(manager, "RewardIssued")
      .withArgs(student.address, 80n, reason);

    expect(await token.balanceOf(student.address)).to.equal(80n);
    expect((await manager.getProposal(1n)).approved).to.equal(true);

    // Double-approval
    await expect(manager.connect(admin).approveProposal(1n))
      .to.be.revertedWithCustomError(manager, "ProposalAlreadyApproved")
      .withArgs(1n);

    // Số dư không bị cộng lần hai
    expect(await token.balanceOf(student.address)).to.equal(80n);

    // Duyệt đề xuất không tồn tại
    await expect(manager.connect(admin).approveProposal(999n))
      .to.be.revertedWithCustomError(manager, "ProposalNotFound")
      .withArgs(999n);
  });

  // =========================================================
  // KỊCH BẢN MỚI: BATCH MINTING + HASH EVIDENCE
  // =========================================================

  it("[TC-13] batchIssueReward rewards 10 students correctly and emits BatchRewardIssued", async function () {
    const { token, manager, admin, signers } =
      await networkHelpers.loadFixture(deploySystemFixture);

    const students = signers.slice(5, 15).map((s) => s.address);
    const amounts = students.map((_, i) => BigInt((i + 1) * 10)); // 10, 20, ..., 100
    const totalAmount = amounts.reduce((a, b) => a + b, 0n);      // 550

    const evidenceHash = ethers.keccak256(
      ethers.toUtf8Bytes("QD-123/QD-DHCNTT&TT - Khen thuong HK1 2026-2027")
    );

    await expect(
      manager.connect(admin).batchIssueReward(students, amounts, evidenceHash)
    )
      .to.emit(manager, "BatchRewardIssued")
      .withArgs(1n, evidenceHash, 10n, totalAmount, admin.address);

    for (let i = 0; i < students.length; i++) {
      expect(await token.balanceOf(students[i])).to.equal(amounts[i]);
    }

    expect(await token.totalSupply()).to.equal(totalAmount);
    expect(await manager.batchCount()).to.equal(1n);
    expect(await manager.batchEvidence(1n)).to.equal(evidenceHash);
    expect(await manager.evidenceUsed(evidenceHash)).to.equal(true);

    // Chống phát lại: cùng một quyết định không thể dùng lần thứ hai
    await expect(
      manager.connect(admin).batchIssueReward(students, amounts, evidenceHash)
    )
      .to.be.revertedWithCustomError(manager, "EvidenceAlreadyUsed")
      .withArgs(evidenceHash);
  });

  it("[TC-14] batchIssueReward reverts when students.length != amounts.length", async function () {
    const { token, manager, admin, signers } =
      await networkHelpers.loadFixture(deploySystemFixture);

    const students = signers.slice(5, 8).map((s) => s.address); // 3 phần tử
    const amounts = [10n, 20n];                                 // 2 phần tử
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("QD-mismatch"));

    await expect(
      manager.connect(admin).batchIssueReward(students, amounts, evidenceHash)
    )
      .to.be.revertedWithCustomError(manager, "ArrayLengthMismatch")
      .withArgs(3n, 2n);

    expect(await token.totalSupply()).to.equal(0n);
    expect(await manager.batchCount()).to.equal(0n);
  });
});