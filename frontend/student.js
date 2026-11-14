// ==========================================
// Student Portal Application Logic (student.js)
// ==========================================

const studentUser = checkStudent();

const REWARD_API = `${API_BASE}/reward`;
const STUDENT_API = `${API_BASE}/student`;

let currentStudentProfile = null;
let currentRewardsList = [];

// ==========================================
// Initialization
// ==========================================
async function initStudentApp() {
    await refreshStudentData();
}

async function refreshStudentData() {
    await loadStudentProfile();
    await loadStudentBalance();
    await loadStudentRewards();
}

// ==========================================
// Load Student Profile
// ==========================================
async function loadStudentProfile() {
    try {
        const response = await fetch(`${STUDENT_API}/profile`, {
            headers: authHeader()
        });

        if (!response.ok) {
            const errData = await response.json();
            showToast(errData.error || "Không thể tải hồ sơ sinh viên", "error");
            return;
        }

        const student = await response.json();
        currentStudentProfile = student;

        // Header info
        const headerName = document.getElementById("studentHeaderName");
        const headerId = document.getElementById("studentHeaderId");
        const avatar = document.getElementById("studentAvatar");
        if (headerName) headerName.textContent = student.name;
        if (headerId) headerId.textContent = student.studentId;
        if (avatar) avatar.textContent = (student.name || "S").substring(0, 1).toUpperCase();

        // Profile Card
        const profileNameEl = document.getElementById("profileName");
        const profileSubEl = document.getElementById("profileIdAndEmail");
        const countEl = document.getElementById("profileRewardCount");
        const walletEl = document.getElementById("walletAddressFull");
        const walletRawInput = document.getElementById("walletRaw");

        if (profileNameEl) profileNameEl.textContent = student.name;
        if (profileSubEl) profileSubEl.textContent = `Mã SV: ${student.studentId} • ${student.email || "Chưa cập nhật email"}`;
        if (countEl) countEl.textContent = student.rewardCount || 0;
        if (walletEl) walletEl.textContent = student.wallet;
        if (walletRawInput) walletRawInput.value = student.wallet;

    } catch (error) {
        console.error("Load profile error:", error);
    }
}

// ==========================================
// Load Token Balance
// ==========================================
async function loadStudentBalance() {
    const balanceEl = document.getElementById("profileBalance");
    if (!balanceEl) return;

    balanceEl.textContent = "⏳...";

    try {
        const response = await fetch(`${REWARD_API}/my-balance`, {
            headers: authHeader()
        });

        const data = await response.json();

        if (response.ok && data.balance !== undefined) {
            balanceEl.textContent = `${Number(data.balance).toLocaleString()} ICTU`;
        } else {
            balanceEl.textContent = "0 ICTU";
        }
    } catch (error) {
        console.error("Load balance error:", error);
        balanceEl.textContent = "0 ICTU";
    }
}

// ==========================================
// Load Reward History
// ==========================================
async function loadStudentRewards() {
    const table = document.getElementById("studentRewardTable");
    if (!table) return;

    try {
        const response = await fetch(`${REWARD_API}/my-history`, {
            headers: authHeader()
        });

        if (!response.ok) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--danger); padding: 2rem;">
                        Lỗi khi tải lịch sử khen thưởng
                    </td>
                </tr>
            `;
            return;
        }

        const rewards = await response.json();
        currentRewardsList = Array.isArray(rewards) ? rewards : [];

        if (currentRewardsList.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">
                        🎉 Bạn chưa có phần thưởng nào. Hãy tích cực tham gia nghiên cứu khoa học & phong trào học tập nhé!
                    </td>
                </tr>
            `;
            return;
        }

        table.innerHTML = currentRewardsList.map(item => {
            let evidenceBtn = "";
            if (item.evidence_name || item.evidence_hash) {
                evidenceBtn = `
                    <div style="margin-top: 4px;">
                        <button class="btn btn-secondary btn-sm" onclick="viewEvidence(${JSON.stringify({
                            name: item.evidence_name,
                            hash: item.evidence_hash,
                            data: item.evidence_data,
                            studentName: currentStudentProfile ? currentStudentProfile.name : "Sinh viên",
                            studentId: currentStudentProfile ? currentStudentProfile.studentId : "--",
                            reason: item.reason
                        }).replace(/"/g, '&quot;')})" style="padding: 2px 8px; font-size: 0.74rem; border-color: var(--primary); color: var(--primary);">
                            📎 Xem minh chứng
                        </button>
                    </div>
                `;
            }

            return `
            <tr>
                <td>
                    <span class="badge badge-token" style="font-size: 0.9rem;">
                        🪙 +${item.amount} ICTU
                    </span>
                </td>
                <td>
                    <div><strong>${item.reason || "Khen thưởng học tập"}</strong></div>
                    ${evidenceBtn}
                </td>
                <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span class="mono" style="color: var(--primary); font-size: 0.85rem;">${shortAddress(item.transactionHash)}</span>
                        <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${item.transactionHash}', 'Mã Tx Hash')" title="Sao chép Tx Hash">📋</button>
                    </div>
                </td>
                <td style="font-size: 0.85rem; color: var(--text-secondary);">${formatDate(item.createdAt)}</td>
                <td>
                    <span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0;">
                        ✅ Đã xác nhận
                    </span>
                </td>
                <td>
                    <button class="btn btn-secondary btn-sm" onclick="viewReceipt(${JSON.stringify(item).replace(/"/g, '&quot;')})">
                        🔍 Biên lai
                    </button>
                </td>
            </tr>
            `;
        }).join("");

    } catch (error) {
        console.error("Load rewards error:", error);
    }
}

// ==========================================
// Copy Wallet
// ==========================================
function copyWallet() {
    const wallet = document.getElementById("walletRaw").value || 
                   (currentStudentProfile ? currentStudentProfile.wallet : "");
    if (!wallet) {
        showToast("Không tìm thấy địa chỉ ví", "warning");
        return;
    }
    copyToClipboard(wallet, "Địa chỉ ví cá nhân");
}

// ==========================================
// Modal Helpers
// ==========================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add("active");
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove("active");
}

function viewReceipt(item) {
    const content = document.getElementById("txReceiptContent");
    if (!content) return;

    content.innerHTML = `
        <div style="background: var(--bg-alt); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-weight: 700; color: var(--primary); font-size: 1.1rem;">Khen thưởng Học thuật ICTU</span>
                <span class="badge badge-token">🪙 +${item.amount} ICTU</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 0.88rem;">
                <span style="color: var(--text-muted);">Sinh viên nhận:</span>
                <span><b>${currentStudentProfile ? currentStudentProfile.name : "Sinh viên"}</b></span>

                <span style="color: var(--text-muted);">Lý do khen thưởng:</span>
                <span>${item.reason || "Khen thưởng học thuật"}</span>

                <span style="color: var(--text-muted);">Địa chỉ ví nhận:</span>
                <span class="mono">${item.student || (currentStudentProfile ? currentStudentProfile.wallet : "--")}</span>

                <span style="color: var(--text-muted);">Mã giao dịch (Tx):</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="mono" style="word-break: break-all; color: var(--primary); font-size: 0.82rem;">${item.transactionHash}</span>
                    <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${item.transactionHash}', 'Mã Tx')">📋</button>
                </div>

                <span style="color: var(--text-muted);">Thời gian cấp:</span>
                <span>${formatDate(item.createdAt)}</span>

                <span style="color: var(--text-muted);">Trạng thái chuỗi:</span>
                <span style="color: var(--success); font-weight: 600;">Đã xác thực trên Hardhat Node</span>
            </div>
        </div>
        <p style="font-size: 0.78rem; color: var(--text-muted); text-align: center;">
            Chứng chỉ token số này được phát hành qua Smart Contract RewardManager với quyền truy cập Role-Based Access Control.
        </p>
    `;

    openModal("txReceiptModal");
}

// ==========================================
// Change Password Modal & Logic
// ==========================================
function openChangePasswordModal() {
    const oldP = document.getElementById("oldPassword");
    const newP = document.getElementById("newPassword");
    const confP = document.getElementById("confirmPassword");
    if (oldP) oldP.value = "";
    if (newP) newP.value = "";
    if (confP) confP.value = "";
    openModal("changePasswordModal");
}

async function handleChangePasswordSubmit(event) {
    event.preventDefault();
    const oldPassword = document.getElementById("oldPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const saveBtn = document.getElementById("savePasswordBtn");

    if (newPassword !== confirmPassword) {
        showToast("Mật khẩu mới và xác nhận mật khẩu không trùng khớp!", "warning");
        return;
    }

    if (newPassword.length < 6) {
        showToast("Mật khẩu mới phải có tối thiểu 6 ký tự!", "warning");
        return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = "⏳ Đang cập nhật...";

    try {
        const response = await fetch(`${API_BASE}/auth/change-password`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ oldPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Đổi mật khẩu thất bại", "error");
            saveBtn.disabled = false;
            saveBtn.innerHTML = "💾 Lưu mật khẩu";
            return;
        }

        showToast("🎉 Đổi mật khẩu thành công! Vui lòng ghi nhớ mật khẩu mới.", "success");
        closeModal("changePasswordModal");
        saveBtn.disabled = false;
        saveBtn.innerHTML = "💾 Lưu mật khẩu";
    } catch (err) {
        console.error("Change password error:", err);
        showToast("Lỗi kết nối máy chủ", "error");
        saveBtn.disabled = false;
        saveBtn.innerHTML = "💾 Lưu mật khẩu";
    }
}

// Start student app
window.addEventListener("DOMContentLoaded", initStudentApp);