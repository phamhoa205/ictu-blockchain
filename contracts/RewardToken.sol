// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title  RewardToken - ICTU Reward Token (Soulbound ERC-20)
 * @notice Token khen thưởng sinh viên Trường ĐH CNTT&TT (ICTU).
 *
 *         Đóng góp nghiên cứu #1 - Cơ chế "Non-Transferable P2P" (Soulbound ERC-20):
 *         - Khi `transferLocked == true` (mặc định), mọi giao dịch chuyển nhượng
 *           giữa hai ví thông thường (from != 0 && to != 0) đều bị chặn
 *           => loại bỏ khả năng mua bán / sang nhượng thành tích.
 *         - Chỉ cho phép:
 *             + Mint  (from == address(0)) : nhà trường cấp phát điểm thưởng.
 *             + Burn  (to   == address(0)) : sinh viên đổi điểm lấy dịch vụ nhà trường.
 *         - Quản trị viên (DEFAULT_ADMIN_ROLE) có thể mở khóa khi chính sách thay đổi.
 *
 * @dev    Tương thích ngược 100% với phiên bản trước:
 *         giữ nguyên `name`, `symbol`, `MINTER_ROLE`, `mint(address,uint256)`.
 */
contract RewardToken is ERC20, ERC20Burnable, AccessControl {

    /// @notice Vai trò được phép phát hành token (cấp cho hợp đồng RewardManager).
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    /// @notice Cờ khóa chuyển nhượng ngang hàng (P2P). Mặc định: khóa.
    bool public transferLocked = true;

    /// @notice Phát ra khi trạng thái khóa chuyển nhượng thay đổi.
    event TransferLockUpdated(bool locked, address indexed updatedBy);

    /// @notice Lỗi khi độ dài 2 mảng đầu vào của `batchMint` không khớp.
    error RewardTokenArrayLengthMismatch(uint256 recipients, uint256 amounts);

    constructor()
        ERC20("ICTU Reward Token", "ICTU")
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // =========================================================
    // MINTING (giữ nguyên chữ ký hàm cũ)
    // =========================================================

    /**
     * @notice Phát hành `amount` token cho `student`.
     * @dev    Chữ ký hàm KHÔNG thay đổi so với phiên bản cũ (backward compatible).
     */
    function mint(
        address student,
        uint256 amount
    )
        public
        onlyRole(MINTER_ROLE)
    {
        _mint(student, amount);
    }

    /**
     * @notice Phát hành token hàng loạt trong MỘT lời gọi ngoài (external call).
     * @dev    Phục vụ thuật toán Batch Minting của RewardManager: thay vì N lần
     *         CALL liên hợp đồng (mỗi lần tốn chi phí cold-access + ABI decode),
     *         chỉ cần 1 lần CALL và lặp `_mint` nội bộ.
     */
    function batchMint(
        address[] calldata recipients,
        uint256[] calldata amounts
    )
        external
        onlyRole(MINTER_ROLE)
    {
        uint256 length = recipients.length;
        if (length != amounts.length) {
            revert RewardTokenArrayLengthMismatch(length, amounts.length);
        }

        for (uint256 i = 0; i < length; ) {
            _mint(recipients[i], amounts[i]);
            unchecked { ++i; }
        }
    }

    // =========================================================
    // SOULBOUND CONTROL
    // =========================================================

    /**
     * @notice Bật / tắt khóa chuyển nhượng P2P.
     * @param  _locked true = khóa (Soulbound), false = cho phép chuyển nhượng.
     */
    function setTransferLock(bool _locked)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        transferLocked = _locked;
        emit TransferLockUpdated(_locked, msg.sender);
    }

    /**
     * @dev Hook trung tâm của OpenZeppelin v5: mọi thao tác mint / burn / transfer
     *      đều đi qua `_update`. Ghi đè tại đây đảm bảo KHÔNG có đường vòng nào
     *      (transfer, transferFrom, ...) né được cơ chế khóa.
     */
    function _update(
        address from,
        address to,
        uint256 value
    )
        internal
        override
    {
        if (transferLocked && from != address(0) && to != address(0)) {
            revert("ICTU_Token: Peer-to-peer transfer is locked");
        }
        super._update(from, to, value);
    }
}