# Kết quả Thực nghiệm Đo lường Gas

> Sinh tự động bởi `scripts/benchmarkExperiment.ts` lúc 2026-10-28T13:36:27.275Z
> Môi trường: HardhatNetwork/3.11.1/@nomicfoundation/edr/0.3.8 | Chain ID 31337 | solc 0.8.28 (optimizer tắt)

## Thí nghiệm 1 - Single Minting (Baseline) vs. Batch Minting (Proposed)

| N (SV) | Baseline: N × issueReward (gas) | Số Tx | Proposed: 1 × batchIssueReward (gas) | Số Tx | Gas tiết kiệm | Tỷ lệ tiết kiệm | Gas/SV Baseline | Gas/SV Proposed | Thời gian Baseline (ms) | Thời gian Proposed (ms) |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 69,147 | 1 | 140,428 | 1 | -71,281 | **-103.09%** | 69,147 | 140,428 | 4.7 | 7.9 |
| 10 | 691,446 | 10 | 407,150 | 1 | 284,296 | **41.12%** | 69,144 | 40,715 | 70.5 | 13.0 |
| 25 | 1,728,615 | 25 | 851,674 | 1 | 876,941 | **50.73%** | 69,144 | 34,066 | 91.6 | 41.3 |
| 50 | 3,457,326 | 50 | 1,592,640 | 1 | 1,864,686 | **53.93%** | 69,146 | 31,852 | 130.6 | 85.3 |
| 100 | 6,914,532 | 100 | 3,074,396 | 1 | 3,840,136 | **55.54%** | 69,145 | 30,743 | 215.6 | 212.1 |

```text
Tổng Gas tiêu thụ (B = Baseline, P = Proposed)
N=  1 B | █ 69,147
      P | █ 140,428
N= 10 B | ████ 691,446
      P | ██ 407,150
N= 25 B | ██████████ 1,728,615
      P | █████ 851,674
N= 50 B | ████████████████████ 3,457,326
      P | █████████ 1,592,640
N=100 B | ████████████████████████████████████████ 6,914,532
      P | ██████████████████ 3,074,396
```

## Thí nghiệm 2 - On-chain String Storage vs. Off-chain Hash Storage (bytes32)

| Độ dài lý do (ký tự) | Kích thước (byte) | issueReward(string) (gas) | issueRewardWithHash(bytes32) (gas) | Gas tiết kiệm | Tỷ lệ tiết kiệm |
|---:|---:|---:|---:|---:|---:|
| 20 | 20 | 69,147 | 67,817 | 1,330 | **1.92%** |
| 100 | 100 | 71,295 | 67,829 | 3,466 | **4.86%** |
| 500 | 500 | 80,862 | 67,841 | 13,021 | **16.10%** |

- Hệ số tăng biên của phương pháp lưu chuỗi: **24.41 gas/byte**
- Hệ số tăng biên của phương pháp lưu mã băm: **0.05 gas/byte** (độ phức tạp O(1))

```text
Gas theo độ dài lý do (S = string, H = bytes32 hash)
L= 20 S | ██████████████████████████████████ 69,147
      H | ██████████████████████████████████ 67,817
L=100 S | ███████████████████████████████████ 71,295
      H | ██████████████████████████████████ 67,829
L=500 S | ████████████████████████████████████████ 80,862
      H | ██████████████████████████████████ 67,841
```
