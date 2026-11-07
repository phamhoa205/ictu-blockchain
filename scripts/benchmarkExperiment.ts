/**
 * =====================================================================
 *  THỰC NGHIỆM ĐO LƯỜNG KHOA HỌC - ICTU BLOCKCHAIN REWARD SYSTEM
 * =====================================================================
 *  Chạy:  npx hardhat run scripts/benchmarkExperiment.ts
 *
 *  Thí nghiệm 1: Single Minting (Baseline) vs. Batch Minting (Proposed)
 *                N ∈ {1, 10, 25, 50, 100} sinh viên.
 *  Thí nghiệm 2: On-chain String Storage vs. Off-chain Hash (bytes32)
 *                Độ dài lý do: 20, 100, 500 ký tự (ASCII, 1 ký tự = 1 byte).
 *
 *  Phương pháp luận (đảm bảo tính đối chứng công bằng):
 *   - Mỗi phép đo được thực hiện trên CÙNG một trạng thái chuỗi ban đầu
 *     (khôi phục snapshot EVM trước mỗi phép đo).
 *   - Trước khi chụp snapshot, thực hiện 1 giao dịch "làm ấm" (warm-up) để
 *     totalSupply khác 0 -> loại bỏ chi phí khởi tạo slot một lần duy nhất,
 *     không để nó làm lệch kết quả của phương pháp nào.
 *   - Địa chỉ sinh viên được sinh tất định (deterministic) từ keccak256 và
 *     chưa từng nắm giữ token -> mọi phương pháp đều chịu cùng chi phí
 *     SSTORE 0 -> khác 0 cho số dư.
 *   - gasUsed lấy trực tiếp từ Transaction Receipt (bao gồm 21,000 gas nội tại
 *     và chi phí calldata), không ước lượng.
 *
 *  Kết quả được in ra Terminal dưới dạng bảng Markdown và lưu vào:
 *     docs/benchmark-results.json
 *     docs/benchmark-results.md
 * =====================================================================
 */
import { network } from "hardhat";
import fs from "node:fs";
import path from "node:path";

const { ethers, networkHelpers } = await network.create();

// ---------------------------------------------------------------------
// Cấu hình thực nghiệm
// ---------------------------------------------------------------------
const BATCH_SIZES = [1, 10, 25, 50, 100];
const REASON_LENGTHS = [20, 100, 500];
const REWARD_AMOUNT = 10n;
const BASELINE_REASON = "Khen thuong HK1 2026"; // đúng 20 ký tự ASCII

// ---------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------
function deterministicStudents(n: number, salt: string): string[] {
  return Array.from({ length: n }, (_, i) =>
    ethers.getAddress(
      ethers.dataSlice(ethers.keccak256(ethers.toUtf8Bytes(`${salt}-student-${i}`)), 12),
    ),
  );
}

function makeReason(length: number): string {
  const base =
    "Sinh vien dat thanh tich xuat sac trong hoc tap va nghien cuu khoa hoc tai ICTU. ";
  let s = "";
  while (s.length < length) s += base;
  return s.slice(0, length);
}

const fmt = (n: bigint | number) => Number(n).toLocaleString("en-US");
const pct = (saved: bigint, base: bigint) =>
  ((Number(saved) / Number(base)) * 100).toFixed(2);

function bar(value: number, max: number, width = 40): string {
  const len = Math.max(1, Math.round((value / max) * width));
  return "█".repeat(len);
}

// ---------------------------------------------------------------------
// Triển khai hệ thống
// ---------------------------------------------------------------------
async function deploySystem() {
  const [admin] = await ethers.getSigners();

  const token = await ethers.deployContract("RewardToken");
  await token.waitForDeployment();

  const manager = await ethers.deployContract("RewardManager", [await token.getAddress()]);
  await manager.waitForDeployment();

  await (await token.grantRole(await token.MINTER_ROLE(), await manager.getAddress())).wait();

  // Warm-up: đưa totalSupply về trạng thái khác 0
  const warmup = deterministicStudents(1, "warmup")[0];
  await (await manager.issueReward(warmup, 1n, "warm-up")).wait();

  return { admin, token, manager };
}

// ---------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------
async function main() {
  console.log("=====================================================================");
  console.log(" ICTU BLOCKCHAIN REWARD - SCIENTIFIC BENCHMARK EXPERIMENT");
  console.log("=====================================================================");

  const { token, manager } = await deploySystem();
  const snapshot = await networkHelpers.takeSnapshot();

  const hhVersion = (await ethers.provider.send("web3_clientVersion", [])) as string;
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const blockGasLimit = (await ethers.provider.getBlock("latest"))!.gasLimit;

  console.log(`Client         : ${hhVersion}`);
  console.log(`Chain ID       : ${chainId}`);
  console.log(`Block gas limit: ${fmt(blockGasLimit)}`);
  console.log(`Solidity       : 0.8.28 (optimizer: disabled - default profile)`);

  // =================================================================
  // THÍ NGHIỆM 1
  // =================================================================
  console.log("\n▶ Running Experiment 1: Single Minting vs. Batch Minting ...");

  type Exp1Row = {
    n: number;
    baselineGas: bigint;
    baselineTxCount: number;
    baselineTimeMs: number;
    batchGas: bigint;
    batchTimeMs: number;
    savedGas: bigint;
    savedPercent: string;
    baselineGasPerStudent: bigint;
    batchGasPerStudent: bigint;
  };
  const exp1: Exp1Row[] = [];

  for (const n of BATCH_SIZES) {
    const students = deterministicStudents(n, `exp1-n${n}`);
    const amounts = students.map(() => REWARD_AMOUNT);

    // --- Baseline: N giao dịch issueReward riêng lẻ
    await snapshot.restore();
    let baselineGas = 0n;
    const t0 = performance.now();
    for (const s of students) {
      const receipt = await (await manager.issueReward(s, REWARD_AMOUNT, BASELINE_REASON)).wait();
      baselineGas += receipt!.gasUsed;
    }
    const baselineTimeMs = performance.now() - t0;
    for (const s of students) {
      if ((await token.balanceOf(s)) !== REWARD_AMOUNT) throw new Error("Baseline balance mismatch");
    }

    // --- Proposed: 1 giao dịch batchIssueReward
    await snapshot.restore();
    const evidence = ethers.keccak256(ethers.toUtf8Bytes(`QD-KHENTHUONG-N${n}`));
    const t1 = performance.now();
    const batchReceipt = await (await manager.batchIssueReward(students, amounts, evidence)).wait();
    const batchTimeMs = performance.now() - t1;
    const batchGas = batchReceipt!.gasUsed;
    for (const s of students) {
      if ((await token.balanceOf(s)) !== REWARD_AMOUNT) throw new Error("Batch balance mismatch");
    }

    const savedGas = baselineGas - batchGas;
    exp1.push({
      n,
      baselineGas,
      baselineTxCount: n,
      baselineTimeMs,
      batchGas,
      batchTimeMs,
      savedGas,
      savedPercent: pct(savedGas, baselineGas),
      baselineGasPerStudent: baselineGas / BigInt(n),
      batchGasPerStudent: batchGas / BigInt(n),
    });
    console.log(`   N=${String(n).padStart(3)} done`);
  }

  // =================================================================
  // THÍ NGHIỆM 2
  // =================================================================
  console.log("\n▶ Running Experiment 2: String Storage vs. Hash (bytes32) ...");

  type Exp2Row = {
    length: number;
    bytes: number;
    stringGas: bigint;
    hashGas: bigint;
    savedGas: bigint;
    savedPercent: string;
  };
  const exp2: Exp2Row[] = [];
  const student = deterministicStudents(1, "exp2")[0];

  for (const len of REASON_LENGTHS) {
    const reason = makeReason(len);
    const byteLen = ethers.toUtf8Bytes(reason).length;

    await snapshot.restore();
    const r1 = await (await manager.issueReward(student, REWARD_AMOUNT, reason)).wait();

    await snapshot.restore();
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason));
    const r2 = await (await manager.issueRewardWithHash(student, REWARD_AMOUNT, reasonHash)).wait();

    const savedGas = r1!.gasUsed - r2!.gasUsed;
    exp2.push({
      length: len,
      bytes: byteLen,
      stringGas: r1!.gasUsed,
      hashGas: r2!.gasUsed,
      savedGas,
      savedPercent: pct(savedGas, r1!.gasUsed),
    });
    console.log(`   len=${String(len).padStart(3)} done`);
  }

  await snapshot.restore();

  // Hệ số tăng biên (marginal gas / byte) của phương pháp lưu chuỗi
  const first = exp2[0];
  const last = exp2[exp2.length - 1];
  const stringSlope =
    Number(last.stringGas - first.stringGas) / (last.bytes - first.bytes);
  const hashSlope = Number(last.hashGas - first.hashGas) / (last.bytes - first.bytes);

  // =================================================================
  // XUẤT KẾT QUẢ
  // =================================================================
  const lines: string[] = [];
  const out = (s = "") => {
    lines.push(s);
    console.log(s);
  };

  out("");
  out("## Thí nghiệm 1 - Single Minting (Baseline) vs. Batch Minting (Proposed)");
  out("");
  out("| N (SV) | Baseline: N × issueReward (gas) | Số Tx | Proposed: 1 × batchIssueReward (gas) | Số Tx | Gas tiết kiệm | Tỷ lệ tiết kiệm | Gas/SV Baseline | Gas/SV Proposed | Thời gian Baseline (ms) | Thời gian Proposed (ms) |");
  out("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of exp1) {
    out(
      `| ${r.n} | ${fmt(r.baselineGas)} | ${r.baselineTxCount} | ${fmt(r.batchGas)} | 1 | ${fmt(r.savedGas)} | **${r.savedPercent}%** | ${fmt(r.baselineGasPerStudent)} | ${fmt(r.batchGasPerStudent)} | ${r.baselineTimeMs.toFixed(1)} | ${r.batchTimeMs.toFixed(1)} |`,
    );
  }

  out("");
  out("```text");
  out("Tổng Gas tiêu thụ (B = Baseline, P = Proposed)");
  const maxGas = Math.max(...exp1.map((r) => Number(r.baselineGas)));
  for (const r of exp1) {
    out(`N=${String(r.n).padStart(3)} B | ${bar(Number(r.baselineGas), maxGas)} ${fmt(r.baselineGas)}`);
    out(`      P | ${bar(Number(r.batchGas), maxGas)} ${fmt(r.batchGas)}`);
  }
  out("```");

  out("");
  out("## Thí nghiệm 2 - On-chain String Storage vs. Off-chain Hash Storage (bytes32)");
  out("");
  out("| Độ dài lý do (ký tự) | Kích thước (byte) | issueReward(string) (gas) | issueRewardWithHash(bytes32) (gas) | Gas tiết kiệm | Tỷ lệ tiết kiệm |");
  out("|---:|---:|---:|---:|---:|---:|");
  for (const r of exp2) {
    out(
      `| ${r.length} | ${r.bytes} | ${fmt(r.stringGas)} | ${fmt(r.hashGas)} | ${fmt(r.savedGas)} | **${r.savedPercent}%** |`,
    );
  }
  out("");
  out(`- Hệ số tăng biên của phương pháp lưu chuỗi: **${stringSlope.toFixed(2)} gas/byte**`);
  out(`- Hệ số tăng biên của phương pháp lưu mã băm: **${hashSlope.toFixed(2)} gas/byte** (độ phức tạp O(1))`);

  out("");
  out("```text");
  out("Gas theo độ dài lý do (S = string, H = bytes32 hash)");
  const maxGas2 = Math.max(...exp2.map((r) => Number(r.stringGas)));
  for (const r of exp2) {
    out(`L=${String(r.length).padStart(3)} S | ${bar(Number(r.stringGas), maxGas2)} ${fmt(r.stringGas)}`);
    out(`      H | ${bar(Number(r.hashGas), maxGas2)} ${fmt(r.hashGas)}`);
  }
  out("```");

  // Lưu kết quả
  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });

  const json = {
    generatedAt: new Date().toISOString(),
    environment: {
      client: hhVersion,
      chainId: chainId.toString(),
      blockGasLimit: blockGasLimit.toString(),
      solc: "0.8.28",
      optimizer: false,
    },
    methodology: {
      rewardAmount: REWARD_AMOUNT.toString(),
      baselineReason: BASELINE_REASON,
      batchSizes: BATCH_SIZES,
      reasonLengths: REASON_LENGTHS,
      snapshotRestoreBetweenRuns: true,
      warmupBeforeSnapshot: true,
    },
    experiment1: exp1.map((r) => ({
      ...r,
      baselineGas: r.baselineGas.toString(),
      batchGas: r.batchGas.toString(),
      savedGas: r.savedGas.toString(),
      baselineGasPerStudent: r.baselineGasPerStudent.toString(),
      batchGasPerStudent: r.batchGasPerStudent.toString(),
      baselineTimeMs: Number(r.baselineTimeMs.toFixed(2)),
      batchTimeMs: Number(r.batchTimeMs.toFixed(2)),
    })),
    experiment2: exp2.map((r) => ({
      ...r,
      stringGas: r.stringGas.toString(),
      hashGas: r.hashGas.toString(),
      savedGas: r.savedGas.toString(),
    })),
    marginalCost: {
      stringGasPerByte: Number(stringSlope.toFixed(4)),
      hashGasPerByte: Number(hashSlope.toFixed(4)),
    },
  };

  fs.writeFileSync(path.join(docsDir, "benchmark-results.json"), JSON.stringify(json, null, 2));
  fs.writeFileSync(
    path.join(docsDir, "benchmark-results.md"),
    `# Kết quả Thực nghiệm Đo lường Gas\n\n> Sinh tự động bởi \`scripts/benchmarkExperiment.ts\` lúc ${json.generatedAt}\n> Môi trường: ${hhVersion} | Chain ID ${chainId} | solc 0.8.28 (optimizer tắt)\n${lines.join("\n")}\n`,
  );

  console.log("\n📄 Saved: docs/benchmark-results.json");
  console.log("📄 Saved: docs/benchmark-results.md");
  console.log("=====================================================================");
}

main().catch((error) => {
  console.error("❌ Benchmark failed:", error);
  process.exitCode = 1;
});
