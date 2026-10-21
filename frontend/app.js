// ==========================================
// Admin Application Logic (app.js)
// ICTU Blockchain Reward System
// ==========================================

// Verify Admin Authentication
const currentUser = checkAdmin();

// API Endpoints
const API = "http://localhost:3000/api/reward";
const STUDENT_API = "http://localhost:3000/api/student";
const STUDENT_STATS_API = "http://localhost:3000/api/student/stats";

// Application State
let allStudentsList = [];
let currentContractAddresses = { token: "", manager: "" };
let historyCurrentPage = 1;
let historyTotalPages = 1;
let historySearchTerm = "";
let studentSearchTerm = "";

// ==========================================
// Initialization
// ==========================================
async function initApp() {
    if (currentUser) {
        const adminNameEl = document.getElementById("adminName");
        const userAvatarEl = document.getElementById("userAvatar");
        if (adminNameEl) adminNameEl.textContent = currentUser.username || "Admin";
        if (userAvatarEl) userAvatarEl.textContent = (currentUser.username || "A").substring(0, 1).toUpperCase();
    }

    await checkBlockchainHealth();
    await loadStats();
    await loadStudents();
    await loadHistory(1);
    await loadLeaderboard();

    // Auto-refresh blockchain health every 25 seconds
    setInterval(checkBlockchainHealth, 25000);
}

// ==========================================
// Tab Switching
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.add("active");
    }

    // Mark matching tab button as active
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach(btn => {
        if (btn.getAttribute("onclick") && btn.getAttribute("onclick").includes(tabId)) {
            btn.classList.add("active");
        }
    });

    // Refresh tab-specific data
    if (tabId === "history") {
        loadHistory(historyCurrentPage, historySearchTerm);
    } else if (tabId === "leaderboard") {
        loadLeaderboard();
    } else if (tabId === "students") {
        loadStudents(studentSearchTerm);
    } else if (tabId === "dashboard") {
        loadStats();
    }
}

// ==========================================
// Blockchain Health & Contract Details
// ==========================================
async function checkBlockchainHealth() {
    const statusText = document.getElementById("blockchainStatusText");
    const statusBadge = document.getElementById("blockchainStatusBadge");
    const blockEl = document.getElementById("statCurrentBlock");
    const chainEl = document.getElementById("statChainId");

    try {
        const response = await fetch(`${API}/status`);
        const data = await response.json();

        if (data.blockchain && data.blockchain.connected) {
            statusBadge.style.borderColor = "rgba(34, 197, 94, 0.4)";
            statusText.innerHTML = `🟢 Hardhat Node (Khối #${data.blockchain.blockNumber})`;
            if (blockEl) blockEl.textContent = `#${data.blockchain.blockNumber}`;
            if (chainEl) chainEl.textContent = `Chain ID: ${data.blockchain.chainId} • RPC Sẵn sàng`;

            currentContractAddresses.token = data.blockchain.tokenAddress || "";
            currentContractAddresses.manager = data.blockchain.managerAddress || "";

            const tokenAddrEl = document.getElementById("contractTokenAddress");
            const managerAddrEl = document.getElementById("contractManagerAddress");
            if (tokenAddrEl) tokenAddrEl.textContent = shortAddress(currentContractAddresses.token);
            if (managerAddrEl) managerAddrEl.textContent = shortAddress(currentContractAddresses.manager);
        } else {
            statusBadge.style.borderColor = "rgba(239, 68, 68, 0.4)";
            statusText.innerHTML = `🔴 RPC Offline (${data.blockchain ? data.blockchain.error : "Không thể kết nối"})`;
        }
    } catch (err) {
        if (statusText) statusText.innerHTML = "🔴 Mất kết nối Backend (Port 3000)";
    }
}

// ==========================================
// Dashboard Statistics
// ==========================================
async function loadStats() {
    try {
        const [rewardRes, studentRes] = await Promise.all([
            fetch(`${API}/stats`, { headers: authHeader() }),
            fetch(STUDENT_STATS_API, { headers: authHeader() })
        ]);

        if (rewardRes.ok) {
            const rewardStats = await rewardRes.json();
            const totalRewardsEl = document.getElementById("statTotalRewards");
            const totalTokensEl = document.getElementById("statTotalTokens");
            if (totalRewardsEl) totalRewardsEl.textContent = rewardStats.totalRewards || 0;
            if (totalTokensEl) totalTokensEl.textContent = Number(rewardStats.totalTokens || 0).toLocaleString();
        }

        if (studentRes.ok) {
            const studentStats = await studentRes.json();
            const totalStudentsEl = document.getElementById("statTotalStudents");
            const rewardedStudentsEl = document.getElementById("statRewardedStudents");
            if (totalStudentsEl) totalStudentsEl.textContent = studentStats.totalStudents || 0;
            if (rewardedStudentsEl) rewardedStudentsEl.textContent = `${studentStats.rewardedStudents || 0} sinh viên đã nhận thưởng`;
        }
    } catch (error) {
        console.error("Error loading dashboard stats:", error);
    }
}

// ==========================================
// Student Management
// ==========================================
async function loadStudents(search = "") {
    try {
        const url = search ? `${STUDENT_API}?search=${encodeURIComponent(search)}` : STUDENT_API;
        const response = await fetch(url, { headers: authHeader() });

        if (!response.ok) {
            showToast("Không thể tải danh sách sinh viên", "error");
            return;
        }

        const students = await response.json();
        allStudentsList = Array.isArray(students) ? students : (students.data || []);

        const tableBody = document.getElementById("studentTable");
        const countBadge = document.getElementById("studentCountBadge");
        const issueSelect = document.getElementById("issueStudentSelect");

        if (countBadge) countBadge.textContent = `(${allStudentsList.length} sinh viên)`;

        // Render Issue Reward Select options
        if (issueSelect) {
            const currentSelected = issueSelect.value;
            issueSelect.innerHTML = '<option value="">-- Chọn sinh viên nhận thưởng --</option>';
            allStudentsList.forEach(s => {
                const isSelected = s.studentId === currentSelected ? "selected" : "";
                issueSelect.innerHTML += `
                    <option value="${s.studentId}" data-wallet="${s.wallet}" ${isSelected}>
                        ${s.studentId} - ${s.name} (${shortAddress(s.wallet)})
                    </option>
                `;
            });
        }

        // Render Student Management Table
        if (tableBody) {
            if (allStudentsList.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            ${search ? `Không tìm thấy sinh viên nào phù hợp với '${search}'` : "Chưa có sinh viên nào trong hệ thống"}
                        </td>
                    </tr>
                `;
                return;
            }

            tableBody.innerHTML = allStudentsList.map(s => `
                <tr>
                    <td><strong class="mono" style="color: var(--primary);">${s.studentId}</strong></td>
                    <td><strong>${s.name}</strong></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="mono">${shortAddress(s.wallet)}</span>
                            <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${s.wallet}', 'Địa chỉ ví')" title="Sao chép ví">📋</button>
                        </div>
                    </td>
                    <td>${s.email || "<span style='color: var(--text-muted)'>Chưa có</span>"}</td>
                    <td>
                        <span class="badge badge-token">🪙 ${s.totalEarned || 0} ICTU</span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-primary btn-sm" onclick="quickRewardStudent('${s.studentId}')" title="Trao thưởng nhanh">
                                🎁 Thưởng
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s.studentId}')" title="Chỉnh sửa thông tin">
                                ✏️ Sửa
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="handleDeleteStudent('${s.studentId}', '${s.name}')" title="Xóa sinh viên">
                                🗑️
                            </button>
                        </div>
                    </td>
                </tr>
            `).join("");
        }
    } catch (err) {
        console.error("Load students error:", err);
    }
}

function handleStudentSearch() {
    const input = document.getElementById("studentSearchInput");
    studentSearchTerm = input ? input.value.trim() : "";
    loadStudents(studentSearchTerm);
}

function quickRewardStudent(studentId) {
    switchTab("issue");
    const select = document.getElementById("issueStudentSelect");
    if (select) {
        select.value = studentId;
        onStudentSelectChange();
    }
}

// Add Student Modal Handlers
function openAddStudentModal() {
    document.getElementById("newStudentId").value = "";
    document.getElementById("newName").value = "";
    document.getElementById("newWallet").value = "";
    document.getElementById("newEmail").value = "";
    document.getElementById("newPassword").value = "123456";
    openModal("addStudentModal");
}

async function handleAddStudentSubmit(event) {
    event.preventDefault();
    const btn = document.getElementById("btnAddStudentSubmit");
    btn.disabled = true;
    btn.innerHTML = "⏳ Đang thêm...";

    const body = {
        studentId: document.getElementById("newStudentId").value.trim(),
        name: document.getElementById("newName").value.trim(),
        wallet: document.getElementById("newWallet").value.trim(),
        email: document.getElementById("newEmail").value.trim(),
        password: document.getElementById("newPassword").value.trim() || "123456"
    };

    try {
        const response = await fetch(STUDENT_API, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Thêm sinh viên thất bại", "error");
            btn.disabled = false;
            btn.innerHTML = "Xác nhận Thêm";
            return;
        }

        showToast(`Đã thêm sinh viên ${body.name} (${body.studentId}) thành công!`, "success");
        closeModal("addStudentModal");
        await loadStudents();
        await loadStats();
    } catch (err) {
        showToast("Lỗi mạng khi thêm sinh viên", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Xác nhận Thêm";
    }
}

// Edit Student Modal Handlers
function openEditStudentModal(studentId) {
    const student = allStudentsList.find(s => s.studentId === studentId);
    if (!student) {
        showToast("Không tìm thấy thông tin sinh viên", "error");
        return;
    }

    document.getElementById("editStudentIdHidden").value = student.studentId;
    document.getElementById("editStudentIdDisplay").value = student.studentId;
    document.getElementById("editName").value = student.name;
    document.getElementById("editWallet").value = student.wallet;
    document.getElementById("editEmail").value = student.email || "";

    openModal("editStudentModal");
}

async function handleEditStudentSubmit(event) {
    event.preventDefault();
    const studentId = document.getElementById("editStudentIdHidden").value;
    const btn = document.getElementById("btnEditStudentSubmit");

    btn.disabled = true;
    btn.innerHTML = "⏳ Đang lưu...";

    const body = {
        name: document.getElementById("editName").value.trim(),
        wallet: document.getElementById("editWallet").value.trim(),
        email: document.getElementById("editEmail").value.trim()
    };

    try {
        const response = await fetch(`${STUDENT_API}/${studentId}`, {
            method: "PUT",
            headers: authHeader(),
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Cập nhật sinh viên thất bại", "error");
            btn.disabled = false;
            btn.innerHTML = "Lưu Thay Đổi";
            return;
        }

        showToast("Cập nhật thông tin sinh viên thành công!", "success");
        closeModal("editStudentModal");
        await loadStudents();
    } catch (err) {
        showToast("Lỗi mạng khi cập nhật sinh viên", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Lưu Thay Đổi";
    }
}

async function handleDeleteStudent(studentId, name) {
    if (!confirm(`Bạn có chắc chắn muốn xóa sinh viên ${name} (${studentId})?\nThao tác này cũng sẽ xóa tài khoản người dùng và lịch sử liên quan!`)) {
        return;
    }

    try {
        const response = await fetch(`${STUDENT_API}/${studentId}`, {
            method: "DELETE",
            headers: authHeader()
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Xóa sinh viên thất bại", "error");
            return;
        }

        showToast(`Đã xóa sinh viên ${studentId} thành công`, "success");
        await loadStudents();
        await loadStats();
        await loadLeaderboard();
    } catch (err) {
        showToast("Lỗi mạng khi xóa sinh viên", "error");
    }
}

// ==========================================
// Issue Reward Logic
// ==========================================
async function onStudentSelectChange() {
    const select = document.getElementById("issueStudentSelect");
    const previewBox = document.getElementById("studentWalletPreview");
    const walletEl = document.getElementById("previewWallet");
    const balanceEl = document.getElementById("previewBalance");

    if (!select || !select.value) {
        if (previewBox) previewBox.style.display = "none";
        return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const wallet = selectedOption.getAttribute("data-wallet");

    if (previewBox && wallet) {
        previewBox.style.display = "block";
        walletEl.textContent = wallet;
        balanceEl.textContent = "⏳ Đang đọc từ blockchain...";

        try {
            const res = await fetch(`${API}/balance/${wallet}`, { headers: authHeader() });
            if (res.ok) {
                const data = await res.json();
                balanceEl.textContent = `${data.balance} ICTU`;
            } else {
                balanceEl.textContent = "0 ICTU";
            }
        } catch (e) {
            balanceEl.textContent = "-- ICTU";
        }
    }
}

async function handleIssueReward(event) {
    event.preventDefault();
    const btn = document.getElementById("btnIssueSubmit");
    const studentId = document.getElementById("issueStudentSelect").value;
    const amount = document.getElementById("issueAmount").value;
    const reason = document.getElementById("issueReason").value;

    if (!studentId || !amount) {
        showToast("Vui lòng chọn sinh viên và nhập số token thưởng", "warning");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = "⏳ Đang ký giao dịch & ghi nhận vào khối...";

    try {
        const response = await fetch(`${API}/issue`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ studentId, amount: Number(amount), reason })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Giao dịch trao thưởng thất bại", "error");
            btn.disabled = false;
            btn.innerHTML = "🚀 Xác nhận & Ký giao dịch Trao thưởng";
            return;
        }

        showToast(`Đã trao ${amount} ICTU cho sinh viên ${data.name}!`, "success");

        // Show Transaction Receipt Modal
        showTxReceiptModal({
            title: "Trao thưởng Token thành công",
            studentId: data.studentId,
            name: data.name,
            wallet: data.wallet,
            amount: data.amount,
            reason: data.reason,
            txHash: data.transaction,
            blockNumber: data.blockNumber,
            gasUsed: data.gasUsed
        });

        // Reset form & reload stats
        resetIssueForm();
        await loadStats();
        await checkBlockchainHealth();
        await loadStudents();
        await loadHistory(1);
        await loadLeaderboard();

    } catch (err) {
        console.error("Issue reward error:", err);
        showToast("Lỗi khi kết nối tới máy chủ trao thưởng", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "🚀 Xác nhận & Ký giao dịch Trao thưởng";
    }
}

function resetIssueForm() {
    const form = document.getElementById("issueRewardForm");
    if (form) form.reset();
    const previewBox = document.getElementById("studentWalletPreview");
    if (previewBox) previewBox.style.display = "none";
}

// Custom Balance Checker
async function handleCheckBalanceCustom() {
    const input = document.getElementById("checkWalletInput");
    const resultBox = document.getElementById("checkBalanceResult");
    const wallet = input ? input.value.trim() : "";

    if (!wallet) {
        showToast("Vui lòng nhập địa chỉ ví cần kiểm tra", "warning");
        return;
    }

    resultBox.style.display = "block";
    resultBox.innerHTML = "<p style='color: var(--text-muted);'>⏳ Đang truy vấn Smart Contract...</p>";

    try {
        const response = await fetch(`${API}/balance/${wallet}`, { headers: authHeader() });
        const data = await response.json();

        if (!response.ok) {
            resultBox.innerHTML = `<div class="toast toast-error" style="max-width: 100%;">${data.error}</div>`;
            return;
        }

        resultBox.innerHTML = `
            <div style="background: var(--bg-alt); padding: 1rem 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border);">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Số dư ví [${shortAddress(data.wallet)}]:</div>
                <div style="font-size: 1.5rem; font-weight: 800; color: var(--success); margin: 4px 0;">
                    🪙 ${data.balance} ICTU
                </div>
                ${data.studentName ? `<div style="font-size: 0.85rem; color: var(--primary);">Thuộc sinh viên: <b>${data.studentName}</b> (${data.studentId})</div>` : "<div style='font-size: 0.85rem; color: var(--text-muted);'>Ví này chưa gán cho sinh viên cụ thể trong hệ thống</div>"}
            </div>
        `;
    } catch (err) {
        resultBox.innerHTML = `<div class="toast toast-error" style="max-width: 100%;">Lỗi tra cứu số dư</div>`;
    }
}

// ==========================================
// Reward History Table & Pagination
// ==========================================
async function loadHistory(page = 1, search = "") {
    historyCurrentPage = page;
    historySearchTerm = search;

    const table = document.getElementById("historyTable");
    const paginationInfo = document.getElementById("historyPaginationInfo");
    const pageIndicator = document.getElementById("currentPageIndicator");
    const btnPrev = document.getElementById("btnPrevPage");
    const btnNext = document.getElementById("btnNextPage");

    try {
        const url = `${API}/history?page=${page}&limit=10${search ? `&search=${encodeURIComponent(search)}` : ""}`;
        const response = await fetch(url, { headers: authHeader() });

        if (!response.ok) {
            console.error("Failed to fetch history");
            return;
        }

        const result = await response.json();
        const records = result.data || [];
        const total = result.total || 0;
        historyTotalPages = result.totalPages || 1;

        if (table) {
            if (records.length === 0) {
                table.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            ${search ? `Không tìm thấy lịch sử phù hợp với '${search}'` : "Chưa có bản ghi trao thưởng nào"}
                        </td>
                    </tr>
                `;
            } else {
                table.innerHTML = records.map(r => `
                    <tr>
                        <td><span class="mono" style="color: var(--text-muted);">#${r.id}</span></td>
                        <td>
                            <div>
                                <strong>${r.studentName || "Sinh viên"}</strong>
                                ${r.studentId ? `<span class="badge badge-role-student" style="margin-left: 4px;">${r.studentId}</span>` : ""}
                                <div class="mono" style="font-size: 0.78rem; color: var(--text-muted);">${shortAddress(r.wallet)}</div>
                            </div>
                        </td>
                        <td>
                            <span class="badge badge-token" style="font-size: 0.85rem;">
                                🪙 +${r.amount} ICTU
                            </span>
                        </td>
                        <td>${r.reason || "Khen thưởng học tập"}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="mono" style="color: var(--primary); font-size: 0.82rem;">${shortAddress(r.transactionHash)}</span>
                                <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${r.transactionHash}', 'Mã Tx Hash')" title="Sao chép Tx Hash">📋</button>
                            </div>
                        </td>
                        <td style="font-size: 0.82rem; color: var(--text-secondary);">${formatDate(r.createdAt)}</td>
                        <td>
                            <button class="btn btn-secondary btn-sm" onclick="viewHistoryItemDetails(${JSON.stringify(r).replace(/"/g, '&quot;')})">
                                🔍 Xem
                            </button>
                        </td>
                    </tr>
                `).join("");
            }
        }

        // Update Pagination Controls
        if (paginationInfo) {
            const start = total === 0 ? 0 : (page - 1) * 10 + 1;
            const end = Math.min(page * 10, total);
            paginationInfo.textContent = `Hiển thị ${start} - ${end} trong tổng số ${total} giao dịch`;
        }
        if (pageIndicator) pageIndicator.textContent = `Trang ${page} / ${historyTotalPages}`;
        if (btnPrev) btnPrev.disabled = page <= 1;
        if (btnNext) btnNext.disabled = page >= historyTotalPages;

    } catch (err) {
        console.error("Load history error:", err);
    }
}

function changeHistoryPage(delta) {
    const newPage = historyCurrentPage + delta;
    if (newPage >= 1 && newPage <= historyTotalPages) {
        loadHistory(newPage, historySearchTerm);
    }
}

function handleHistorySearch() {
    const input = document.getElementById("historySearchInput");
    const term = input ? input.value.trim() : "";
    loadHistory(1, term);
}

function viewHistoryItemDetails(item) {
    showTxReceiptModal({
        title: "Chi tiết Lịch sử Trao thưởng",
        studentId: item.studentId || "--",
        name: item.studentName || "--",
        wallet: item.wallet,
        amount: item.amount,
        reason: item.reason,
        txHash: item.transactionHash,
        time: formatDate(item.createdAt)
    });
}

// ==========================================
// Leaderboard (Top 10 Students)
// ==========================================
async function loadLeaderboard() {
    const table = document.getElementById("leaderboardTable");
    if (!table) return;

    try {
        const response = await fetch(`${API}/top-students`, { headers: authHeader() });
        if (!response.ok) return;

        const list = await response.json();

        if (list.length === 0) {
            table.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">
                        Chưa có dữ liệu xếp hạng sinh viên
                    </td>
                </tr>
            `;
            return;
        }

        table.innerHTML = list.map((item, index) => {
            const rank = index + 1;
            let rankBadge = `<span class="badge">${rank}</span>`;
            if (rank === 1) rankBadge = `<span class="badge badge-rank-1">🥇 Hạng 1</span>`;
            else if (rank === 2) rankBadge = `<span class="badge badge-rank-2">🥈 Hạng 2</span>`;
            else if (rank === 3) rankBadge = `<span class="badge badge-rank-3">🥉 Hạng 3</span>`;

            return `
                <tr>
                    <td>${rankBadge}</td>
                    <td><strong class="mono" style="color: var(--primary);">${item.studentId || "--"}</strong></td>
                    <td><strong>${item.name}</strong></td>
                    <td><span class="mono">${shortAddress(item.wallet)}</span></td>
                    <td>${item.rewardCount} lượt</td>
                    <td>
                        <span class="badge badge-token" style="font-size: 0.9rem;">
                            🪙 ${Number(item.totalReward).toLocaleString()} ICTU
                        </span>
                    </td>
                </tr>
            `;
        }).join("");
    } catch (err) {
        console.error("Load leaderboard error:", err);
    }
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

function showTxReceiptModal(info) {
    const content = document.getElementById("txReceiptContent");
    if (!content) return;

    content.innerHTML = `
        <div style="background: var(--bg-alt); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border); margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                <span style="font-weight: 700; color: var(--primary); font-size: 1.1rem;">${info.title || "Biên lai"}</span>
                <span class="badge badge-token">🪙 ${info.amount} ICTU</span>
            </div>
            
            <div style="display: grid; grid-template-columns: 140px 1fr; gap: 8px; font-size: 0.88rem;">
                <span style="color: var(--text-muted);">Sinh viên:</span>
                <span><b>${info.name}</b> (${info.studentId})</span>

                <span style="color: var(--text-muted);">Lý do khen thưởng:</span>
                <span>${info.reason}</span>

                <span style="color: var(--text-muted);">Ví nhận thưởng:</span>
                <span class="mono">${info.wallet}</span>

                <span style="color: var(--text-muted);">Mã Tx Hash:</span>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <span class="mono" style="word-break: break-all; color: var(--primary); font-size: 0.82rem;">${info.txHash}</span>
                    <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${info.txHash}', 'Tx Hash')">📋</button>
                </div>

                ${info.blockNumber ? `
                    <span style="color: var(--text-muted);">Khối xác thực:</span>
                    <span class="mono">#${info.blockNumber}</span>
                ` : ""}

                ${info.gasUsed ? `
                    <span style="color: var(--text-muted);">Năng lượng Gas:</span>
                    <span class="mono">${info.gasUsed} gas</span>
                ` : ""}

                ${info.time ? `
                    <span style="color: var(--text-muted);">Thời gian:</span>
                    <span>${info.time}</span>
                ` : ""}
            </div>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center;">
            Giao dịch đã được ghi nhận bất biến trên sổ cái phân tán Smart Contract của mạng Blockchain ICTU.
        </p>
    `;

    openModal("txReceiptModal");
}

// Start application
window.addEventListener("DOMContentLoaded", initApp);