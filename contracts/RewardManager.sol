// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./RewardToken.sol";

/**
 * @title  RewardManager - Hợp đồng quản lý khen thưởng sinh viên ICTU
 * @notice Đóng góp nghiên cứu:
 *         #2 - Quy trình đa vai trò "Giảng viên Đề xuất -> Admin Phê duyệt" ON-CHAIN
 *              (TEACHER_ROLE / DEFAULT_ADMIN_ROLE), chống duyệt lặp (double-approval).
 *         #3 - Thuật toán cấp phát theo lô (Batch Minting) + nén minh chứng bằng
 *              mã băm mật mã học (bytes32) để tối ưu chi phí Gas.
 *
 * @dev    Tương thích ngược 100% với Backend hiện tại:
 *         - Giữ nguyên `rewardToken()`, `issueReward(address,uint256,string)`
 *           và sự kiện `RewardIssued(address indexed,uint256,string)`.
 *         - Tài khoản triển khai (Admin Backend) nhận DEFAULT_ADMIN_ROLE nên vẫn
 *           gọi `issueReward` như trước đây.
 */
contract RewardManager is AccessControl {

    // =========================================================
    // ROLES & CONSTANTS
    // =========================================================

    /// @notice Vai trò Giảng viên - được phép tạo đề xuất khen thưởng.
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");

    /// @notice Giới hạn kích thước lô để chống tấn công DoS vượt block gas limit.
    uint256 public constant MAX_BATCH_SIZE = 200;

    // =========================================================
    // STORAGE
    // =========================================================

    RewardToken public rewardToken;

    struct Proposal {
        address student;
        uint256 amount;
        string  reason;
        address proposer;
        bool    approved;
        bool    rejected;
    }

    /// @notice Tổng số đề xuất đã tạo. ID đề xuất bắt đầu từ 1.
    uint256 public proposalCount;

    /// @notice Tổng số lô khen thưởng đã phát hành. ID lô bắt đầu từ 1.
    uint256 public batchCount;

    mapping(uint256 => Proposal) private _proposals;

    /// @notice Tra cứu mã băm minh chứng theo ID lô (batchId => evidenceHash).
    mapping(uint256 => bytes32) public batchEvidence;

    /// @notice Ánh xạ mã băm minh chứng => ID lô (0 = chưa sử dụng). Phục vụ chống phát lại.
    mapping(bytes32 => uint256) public evidenceBatchId;

    // =========================================================
    // EVENTS
    // =========================================================

    /// @notice Sự kiện gốc - KHÔNG thay đổi để Backend/Frontend tiếp tục lắng nghe.
    event RewardIssued(
        address indexed student,
        uint256 amount,
        string reason
    );

    event RewardIssuedWithHash(
        address indexed student,
        uint256 amount,
        bytes32 indexed reasonHash
    );

    event BatchRewardIssued(
        uint256 indexed batchId,
        bytes32 indexed batchEvidenceHash,
        uint256 studentCount,
        uint256 totalAmount,
        address indexed issuer
    );

    event ProposalCreated(
        uint256 indexed proposalId,
        address indexed proposer,
        address indexed student,
        uint256 amount,
        string reason
    );

    event ProposalApproved(
        uint256 indexed proposalId,
        address indexed approver,
        address indexed student,
        uint256 amount
    );

    event ProposalRejected(
        uint256 indexed proposalId,
        address indexed rejecter,
        string rejectReason
    );

    // =========================================================
    // ERRORS
    // =========================================================

    error InvalidStudent();
    error InvalidAmount();
    error InvalidEvidenceHash();
    error EvidenceAlreadyUsed(bytes32 evidenceHash);
    error EmptyBatch();
    error BatchTooLarge(uint256 size, uint256 maxSize);
    error ArrayLengthMismatch(uint256 students, uint256 amounts);
    error ProposalNotFound(uint256 proposalId);
    error ProposalAlreadyApproved(uint256 proposalId);
    error ProposalAlreadyRejected(uint256 proposalId);

    // =========================================================
    // CONSTRUCTOR
    // =========================================================

    constructor(address tokenAddress) {
        rewardToken = RewardToken(tokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(TEACHER_ROLE, msg.sender);
    }

    // =========================================================
    // (A) PHƯƠNG PHÁP CƠ SỞ - giữ nguyên chữ ký cho Backend
    // =========================================================

    /**
     * @notice Trao thưởng trực tiếp cho 1 sinh viên, lưu lý do dạng chuỗi.
     * @dev    Chữ ký hàm KHÔNG đổi: issueReward(address,uint256,string).
     */
    function issueReward(
        address student,
        uint256 amount,
        string memory reason
    )
        public
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _validateReward(student, amount);

        rewardToken.mint(student, amount);

        emit RewardIssued(student, amount, reason);
    }

    // =========================================================
    // (B) PHƯƠNG PHÁP ĐỀ XUẤT - Hash Compression & Batch Minting
    // =========================================================

    /**
     * @notice Trao thưởng 1 sinh viên, minh chứng lưu dưới dạng mã băm 32 byte.
     * @dev    Chi phí lưu minh chứng O(1), không phụ thuộc độ dài văn bản gốc.
     *         Văn bản gốc lưu off-chain (CSDL / IPFS); có thể kiểm chứng bằng
     *         cách băm lại và so khớp với `reasonHash` trong sự kiện.
     */
    function issueRewardWithHash(
        address student,
        uint256 amount,
        bytes32 reasonHash
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _validateReward(student, amount);
        if (reasonHash == bytes32(0)) revert InvalidEvidenceHash();

        rewardToken.mint(student, amount);

        emit RewardIssuedWithHash(student, amount, reasonHash);
    }

    /**
     * @notice Trao thưởng hàng loạt cho tối đa MAX_BATCH_SIZE sinh viên
     *         trong MỘT giao dịch duy nhất.
     * @param  students          Danh sách ví sinh viên.
     * @param  amounts           Số token tương ứng.
     * @param  batchEvidenceHash Mã băm (SHA-256/Keccak-256) của quyết định khen thưởng.
     */
    function batchIssueReward(
        address[] calldata students,
        uint256[] calldata amounts,
        bytes32 batchEvidenceHash
    )
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        uint256 length = students.length;

        if (length == 0) revert EmptyBatch();
        if (length != amounts.length) revert ArrayLengthMismatch(length, amounts.length);
        if (length > MAX_BATCH_SIZE) revert BatchTooLarge(length, MAX_BATCH_SIZE);
        if (batchEvidenceHash == bytes32(0)) revert InvalidEvidenceHash();
        if (evidenceBatchId[batchEvidenceHash] != 0) revert EvidenceAlreadyUsed(batchEvidenceHash);

        // Effects (Checks-Effects-Interactions)
        uint256 batchId = ++batchCount;
        evidenceBatchId[batchEvidenceHash] = batchId;
        batchEvidence[batchId] = batchEvidenceHash;

        uint256 totalAmount;
        for (uint256 i = 0; i < length; ) {
            _validateReward(students[i], amounts[i]);
            totalAmount += amounts[i];
            emit RewardIssuedWithHash(students[i], amounts[i], batchEvidenceHash);
            unchecked { ++i; }
        }

        // Ghi chú truy vết: mỗi sinh viên đã được ghi nhận bởi sự kiện chuẩn
        // ERC-20 Transfer(0x0 -> student, amount) phát ra trong cùng giao dịch;
        // sự kiện BatchRewardIssued bên dưới gắn toàn bộ giao dịch với mã băm
        // minh chứng. Vì vậy không phát thêm sự kiện trùng lặp cho từng SV.

        // Interaction: 1 lời gọi liên hợp đồng duy nhất cho cả lô
        rewardToken.batchMint(students, amounts);

        emit BatchRewardIssued(batchId, batchEvidenceHash, length, totalAmount, msg.sender);
    }

    // =========================================================
    // (C) QUY TRÌNH ĐA VAI TRÒ ON-CHAIN: ĐỀ XUẤT -> PHÊ DUYỆT
    // =========================================================

    /**
     * @notice Giảng viên tạo đề xuất khen thưởng cho sinh viên.
     * @return proposalId ID của đề xuất (bắt đầu từ 1).
     */
    function createProposal(
        address student,
        uint256 amount,
        string memory reason
    )
        external
        onlyRole(TEACHER_ROLE)
        returns (uint256 proposalId)
    {
        _validateReward(student, amount);

        proposalId = ++proposalCount;

        _proposals[proposalId] = Proposal({
            student:  student,
            amount:   amount,
            reason:   reason,
            proposer: msg.sender,
            approved: false,
            rejected: false
        });

        emit ProposalCreated(proposalId, msg.sender, student, amount, reason);
    }

    /**
     * @notice Admin phê duyệt đề xuất => tự động mint token cho sinh viên.
     * @dev    Áp dụng mẫu Checks-Effects-Interactions: đánh dấu `approved`
     *         TRƯỚC khi gọi ra ngoài, ngăn chặn duyệt lặp / reentrancy.
     */
    function approveProposal(uint256 proposalId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Proposal storage p = _getExistingProposal(proposalId);

        if (p.approved) revert ProposalAlreadyApproved(proposalId);
        if (p.rejected) revert ProposalAlreadyRejected(proposalId);

        p.approved = true;

        rewardToken.mint(p.student, p.amount);

        emit ProposalApproved(proposalId, msg.sender, p.student, p.amount);
        emit RewardIssued(p.student, p.amount, p.reason);
    }

    /**
     * @notice Admin từ chối đề xuất (đề xuất bị đóng vĩnh viễn).
     */
    function rejectProposal(uint256 proposalId, string calldata rejectReason)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Proposal storage p = _getExistingProposal(proposalId);

        if (p.approved) revert ProposalAlreadyApproved(proposalId);
        if (p.rejected) revert ProposalAlreadyRejected(proposalId);

        p.rejected = true;

        emit ProposalRejected(proposalId, msg.sender, rejectReason);
    }

    /// @notice Kiểm tra một mã băm minh chứng đã được sử dụng hay chưa.
    function evidenceUsed(bytes32 evidenceHash) external view returns (bool) {
        return evidenceBatchId[evidenceHash] != 0;
    }

    /// @notice Truy vấn chi tiết đề xuất.
    function getProposal(uint256 proposalId)
        external
        view
        returns (Proposal memory)
    {
        return _getExistingProposal(proposalId);
    }

    // =========================================================
    // INTERNAL HELPERS
    // =========================================================

    function _validateReward(address student, uint256 amount) internal pure {
        if (student == address(0)) revert InvalidStudent();
        if (amount == 0) revert InvalidAmount();
    }

    function _getExistingProposal(uint256 proposalId)
        internal
        view
        returns (Proposal storage p)
    {
        p = _proposals[proposalId];
        if (p.proposer == address(0)) revert ProposalNotFound(proposalId);
    }
}