// ==========================================
// Admin Application Logic (app.js)
// ICTU Blockchain Reward System
// ==========================================

// Verify Admin Authentication
const currentUser = checkAdmin();

// API Endpoints
const API = `${API_BASE}/reward`;
const STUDENT_API = `${API_BASE}/student`;
const STUDENT_STATS_API = `${API_BASE}/student/stats`;

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
    await loadAdminProposals();
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
    document.querySelectorAll(".tab-btn, .sidebar-nav-item").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(content => content.classList.remove("active"));

    const targetTab = document.getElementById(`tab-${tabId}`);
    if (targetTab) {
        targetTab.classList.add("active");
    }

    // Mark matching tab button as active
    const buttons = document.querySelectorAll(".tab-btn, .sidebar-nav-item");
    buttons.forEach(btn => {
        const onclickAttr = btn.getAttribute("onclick") || "";
        if (onclickAttr.includes(`'${tabId}'`) || onclickAttr.includes(`"${tabId}"`)) {
            btn.classList.add("active");
        }
    });

    // Update Topbar Title
    const titles = {
        dashboard: "Tổng quan & Điều hành",
        proposals: "Phê duyệt Đề xuất Khen thưởng",
        issue: "Cấp thưởng Token Trực tiếp",
        history: "Lịch sử Giao dịch & Đối soát IBN",
        students: "Quản lý Sinh viên",
        leaderboard: "Bảng xếp hạng Sinh viên Xuất sắc",
        whitelist: "Danh sách Giảng viên (SSO)"
    };
    const titleEl = document.getElementById("currentSectionTitle");
    if (titleEl && titles[tabId]) {
        titleEl.textContent = titles[tabId];
    }

    // Auto-close mobile sidebar if open
    closeMobileSidebar();

    // Refresh tab-specific data
    if (tabId === "history") {
        loadHistory(historyCurrentPage, historySearchTerm);
    } else if (tabId === "leaderboard") {
        loadLeaderboard();
    } else if (tabId === "students") {
        loadStudents(studentSearchTerm);
    } else if (tabId === "proposals") {
        loadAdminProposals();
    } else if (tabId === "whitelist") {
        loadWhitelistTable();
    } else if (tabId === "dashboard") {
        loadStats();
        loadAdminProposals();
    }
}

// Mobile Sidebar Helpers
function toggleMobileSidebar() {
    const sidebar = document.getElementById("adminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.toggle("open");
    if (overlay) overlay.classList.toggle("active");
}

function closeMobileSidebar() {
    const sidebar = document.getElementById("adminSidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.remove("active");
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
            const chainId = data.blockchain.chainId || 2025;
            const blockNum = data.blockchain.blockNumber ? `#${data.blockchain.blockNumber}` : "IBN-2025";

            if (statusBadge) {
                statusBadge.classList.remove("status-disconnected");
                statusBadge.classList.add("status-connected");
            }
            if (statusText) {
                statusText.textContent = `IBN Production • Chain ID: ${chainId}`;
            }
            if (blockEl) blockEl.textContent = blockNum;
            if (chainEl) chainEl.textContent = `Chain ID: ${chainId} • IBN Gateway`;

            currentContractAddresses.token = data.blockchain.tokenAddress || "";
            currentContractAddresses.manager = data.blockchain.managerAddress || "";

            const tokenAddrEl = document.getElementById("contractTokenAddress");
            const managerAddrEl = document.getElementById("contractManagerAddress");
            if (tokenAddrEl) tokenAddrEl.textContent = shortAddress(currentContractAddresses.token);
            if (managerAddrEl) managerAddrEl.textContent = shortAddress(currentContractAddresses.manager);
        } else {
            if (statusBadge) {
                statusBadge.classList.remove("status-connected");
                statusBadge.classList.add("status-disconnected");
            }
            if (statusText) statusText.textContent = `IBN Offline (${data.blockchain ? data.blockchain.error || "Mất kết nối" : "Mất kết nối"})`;
            if (blockEl) blockEl.textContent = "Offline";
        }
    } catch (err) {
        if (statusBadge) {
            statusBadge.classList.remove("status-connected");
            statusBadge.classList.add("status-disconnected");
        }
        if (statusText) statusText.textContent = "Offline (Lỗi kết nối Backend)";
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
                            <button class="btn-copy-icon" onclick="copyToClipboard('${s.wallet}', 'Địa chỉ ví')" title="Sao chép ví">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td>${s.email || "<span style='color: var(--text-muted)'>Chưa có</span>"}</td>
                    <td>
                        <span class="badge badge-token">${s.totalEarned || 0} ICTU</span>
                    </td>
                    <td>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-primary btn-xs" onclick="quickRewardStudent('${s.studentId}')" title="Trao thưởng nhanh">
                                Thưởng
                            </button>
                            <button class="btn btn-secondary btn-xs" onclick="openEditStudentModal('${s.studentId}')" title="Chỉnh sửa thông tin">
                                Sửa
                            </button>
                            <button class="btn btn-outline-danger btn-xs" onclick="handleDeleteStudent('${s.studentId}', '${s.name}')" title="Xóa sinh viên">
                                Xóa
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

    let data = null;
    const evidence = window.currentEvidence && window.currentEvidence.issue ? window.currentEvidence.issue : null;

    try {
        const response = await fetch(`${API}/issue`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ 
                studentId, 
                amount: Number(amount), 
                reason,
                evidenceFileName: evidence ? evidence.fileName : null,
                evidenceFileData: evidence ? evidence.fileData : null,
                evidenceHash: evidence ? evidence.fileHash : null
            })
        });

        data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Giao dịch trao thưởng thất bại", "error");
            return;
        }
    } catch (err) {
        console.error("Issue reward network error:", err);
        showToast("Lỗi khi kết nối tới máy chủ trao thưởng: " + err.message, "error");
        return;
    } finally {
        btn.disabled = false;
        btn.innerHTML = "🚀 Xác nhận & Ký giao dịch Trao thưởng";
    }

    // Hiển thị thông báo trao thưởng thành công
    showToast(`Đã trao ${amount} ICTU cho sinh viên ${data.name}!`, "success");

    // Hiển thị biên lai giao dịch điện tử
    try {
        if (typeof showTxReceiptModal === "function") {
            showTxReceiptModal({
                title: "Trao thưởng Token thành công",
                studentId: data.studentId,
                name: data.name,
                wallet: data.wallet,
                amount: data.amount,
                reason: data.reason,
                txHash: data.transaction,
                blockNumber: data.blockNumber,
                gasUsed: data.gasUsed,
                time: new Date().toLocaleString("vi-VN")
            });
        }
    } catch (modalErr) {
        console.warn("Lỗi mở modal biên lai:", modalErr);
    }

    // Làm mới UI ngầm (bọc riêng để lỗi UI không làm bật toast lỗi Blockchain)
    try {
        resetIssueForm();
        await loadStats();
        await checkBlockchainHealth();
        await loadStudents();
        await loadHistory(1);
        await loadLeaderboard();
        await loadAdminProposals();
    } catch (uiErr) {
        console.warn("Cảnh báo làm mới dữ liệu sau trao thưởng:", uiErr);
    }
}

function resetIssueForm() {
    const form = document.getElementById("issueRewardForm");
    if (form) form.reset();
    const previewBox = document.getElementById("studentWalletPreview");
    if (previewBox) previewBox.style.display = "none";
    if (typeof clearEvidenceFile === "function") {
        clearEvidenceFile("issue");
    }
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

        // Render Recent Transactions on Dashboard (Top 3)
        const dashTxList = document.getElementById("dashboardRecentTxList");
        if (dashTxList) {
            if (records.length === 0) {
                dashTxList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 1.25rem; font-size: 0.82rem;">Chưa có giao dịch on-chain nào.</div>`;
            } else {
                dashTxList.innerHTML = records.slice(0, 3).map(r => `
                    <div class="recent-tx-item">
                        <div class="recent-tx-row-top">
                            <span class="badge badge-token">+${r.amount} ICTU</span>
                            <span class="recent-tx-time">${formatDate(r.createdAt)}</span>
                        </div>
                        <div class="recent-tx-student">
                            <b>${r.studentName || "Sinh viên"}</b>
                            ${r.studentId ? `<span class="mono" style="font-size: 0.78rem; color: var(--text-muted);">(${r.studentId})</span>` : ""}
                        </div>
                        <div class="recent-tx-hash-row">
                            <a href="https://ibn.ictu.edu.vn/explorer" target="_blank" rel="noopener noreferrer" class="mono recent-tx-link" title="Xem trên IBN Explorer">
                                ${shortAddress(r.transactionHash)} ↗
                            </a>
                            <button class="btn-copy-icon" onclick="copyToClipboard('${r.transactionHash}', 'Mã Tx Hash')" title="Sao chép Tx Hash">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </div>
                `).join("");
            }
        }

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
                table.innerHTML = records.map(r => {
                    let evidenceBtn = "";
                    if (r.evidence_name || r.evidence_hash) {
                        evidenceBtn = `
                            <div style="margin-top: 4px;">
                                <button class="btn btn-secondary btn-xs" onclick="viewEvidence(${JSON.stringify({
                                    name: r.evidence_name,
                                    hash: r.evidence_hash,
                                    data: r.evidence_data,
                                    studentName: r.studentName,
                                    studentId: r.studentId,
                                    reason: r.reason
                                }).replace(/"/g, '&quot;')})" style="padding: 2px 8px; font-size: 0.74rem;">
                                    📎 Xem minh chứng
                                </button>
                            </div>
                        `;
                    }

                    return `
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
                            <span class="badge badge-token">
                                +${r.amount} ICTU
                            </span>
                        </td>
                        <td>
                            <div>${r.reason || "Khen thưởng học tập"}</div>
                            ${evidenceBtn}
                        </td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <a href="https://ibn.ictu.edu.vn/explorer" target="_blank" rel="noopener noreferrer" class="mono recent-tx-link" title="Xem trên IBN Explorer">${shortAddress(r.transactionHash)} ↗</a>
                                <button class="btn-copy-icon" onclick="copyToClipboard('${r.transactionHash}', 'Mã Tx Hash')" title="Sao chép Tx Hash">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                </button>
                            </div>
                        </td>
                        <td style="font-size: 0.82rem; color: var(--text-secondary);">${formatDate(r.createdAt)}</td>
                        <td>
                            <button class="btn btn-secondary btn-xs" onclick="viewHistoryItemDetails(${JSON.stringify(r).replace(/"/g, '&quot;')})">
                                Chi tiết
                            </button>
                        </td>
                    </tr>
                    `;
                }).join("");
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
            let rankBadge = `<span class="rank-badge">${rank}</span>`;
            if (rank === 1) rankBadge = `<span class="rank-badge rank-1">#1</span>`;
            else if (rank === 2) rankBadge = `<span class="rank-badge rank-2">#2</span>`;
            else if (rank === 3) rankBadge = `<span class="rank-badge rank-3">#3</span>`;

            return `
                <tr>
                    <td>${rankBadge}</td>
                    <td><strong class="mono" style="color: var(--primary);">${item.studentId || "--"}</strong></td>
                    <td><strong>${item.name}</strong></td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="mono">${shortAddress(item.wallet)}</span>
                            <button class="btn-copy-icon" onclick="copyToClipboard('${item.wallet}', 'Địa chỉ ví')" title="Sao chép ví">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                        </div>
                    </td>
                    <td>${item.rewardCount} lượt</td>
                    <td>
                        <span class="badge badge-token">
                            +${Number(item.totalReward).toLocaleString()} ICTU
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

// ==========================================
// Admin Proposals Management
// ==========================================
let currentAdminProposals = [];

async function loadAdminProposals() {
    const tbody = document.getElementById("adminProposalsTableBody");
    const badge = document.getElementById("pendingProposalsBadge");
    if (!tbody) return;

    try {
        const response = await fetch(`${API}/proposals`, {
            headers: authHeader()
        });

        if (!response.ok) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 1.5rem;">Không thể tải danh sách đề xuất</td></tr>`;
            return;
        }

        const proposals = await response.json();
        currentAdminProposals = proposals;

        let pendingCount = 0;
        const pendingList = [];
        proposals.forEach(p => {
            if (p.status === "PENDING") {
                pendingCount++;
                pendingList.push(p);
            }
        });

        if (badge) {
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.style.display = "inline-block";
            } else {
                badge.style.display = "none";
            }
        }

        const kpiPendingEl = document.getElementById("kpiPendingProposals");
        if (kpiPendingEl) {
            kpiPendingEl.textContent = pendingCount;
        }

        // Render Dashboard Pending Proposals (Top 5 PENDING)
        const dashTbody = document.getElementById("dashboardPendingProposalsTableBody");
        if (dashTbody) {
            if (pendingList.length === 0) {
                dashTbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.75rem;">Hiện không có đề xuất nào đang chờ phê duyệt.</td></tr>`;
            } else {
                dashTbody.innerHTML = pendingList.slice(0, 5).map(p => {
                    let evBtn = "";
                    if (p.evidence_name || p.evidence_hash) {
                        evBtn = `
                            <div style="margin-top: 2px;">
                                <button class="btn-link-xs" onclick="viewEvidence(${JSON.stringify({
                                    name: p.evidence_name,
                                    hash: p.evidence_hash,
                                    data: p.evidence_data,
                                    studentName: p.studentName,
                                    studentId: p.studentId,
                                    reason: p.reason
                                }).replace(/"/g, '&quot;')})">📎 Minh chứng</button>
                            </div>
                        `;
                    }
                    return `
                        <tr>
                            <td><b>${p.teacherName || p.teacherUsername}</b></td>
                            <td>
                                <div><b>${p.studentName || "--"}</b></div>
                                <span class="mono" style="font-size: 0.75rem; color: var(--text-muted);">${p.studentId}</span>
                            </td>
                            <td><span class="badge badge-token">+${p.amount} ICTU</span></td>
                            <td style="max-width: 180px;">
                                <div style="font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.reason}">${p.reason}</div>
                                ${evBtn}
                            </td>
                            <td>
                                <div style="display: flex; gap: 4px;">
                                    <button class="btn btn-primary btn-xs" onclick="approveProposal(${p.id})">Ký On-chain</button>
                                    <button class="btn btn-outline-danger btn-xs" onclick="rejectProposal(${p.id})">Từ chối</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("");
            }
        }

        if (proposals.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có đề xuất khen thưởng nào từ Giảng viên.</td></tr>`;
            return;
        }

        let html = "";
        proposals.forEach(p => {
            let statusBadge = "";
            let actionButtons = "";

            if (p.status === "PENDING") {
                statusBadge = `<span class="badge badge-warning">Chờ duyệt</span>`;
                actionButtons = `
                    <div style="display: flex; gap: 6px;">
                        <button class="btn btn-primary btn-xs" onclick="approveProposal(${p.id})">
                            Ký On-chain
                        </button>
                        <button class="btn btn-outline-danger btn-xs" onclick="rejectProposal(${p.id})">
                            Từ chối
                        </button>
                    </div>
                `;
            } else if (p.status === "APPROVED") {
                statusBadge = `<span class="badge badge-success">Đã ký On-chain</span>`;
                actionButtons = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <a href="https://ibn.ictu.edu.vn/explorer" target="_blank" rel="noopener noreferrer" class="mono recent-tx-link" title="Xem trên IBN Explorer">${shortAddress(p.transactionHash)} ↗</a>
                        <button class="btn-copy-icon" onclick="copyToClipboard('${p.transactionHash}', 'Mã Tx')" title="Sao chép Tx">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        </button>
                    </div>
                `;
            } else {
                statusBadge = `<span class="badge badge-danger">Đã từ chối</span>`;
                actionButtons = `<span style="font-size: 0.8rem; color: var(--text-muted);">${p.rejectReason || "Không đạt"}</span>`;
            }

            let evidenceBtn = "";
            if (p.evidence_name || p.evidence_hash) {
                evidenceBtn = `
                    <div style="margin-top: 4px;">
                        <button class="btn btn-secondary btn-xs" onclick="viewEvidence(${JSON.stringify({
                            name: p.evidence_name,
                            hash: p.evidence_hash,
                            data: p.evidence_data,
                            studentName: p.studentName,
                            studentId: p.studentId,
                            reason: p.reason
                        }).replace(/"/g, '&quot;')})" style="padding: 2px 8px; font-size: 0.74rem;">
                            📎 Xem minh chứng
                        </button>
                    </div>
                `;
            }

            html += `
                <tr>
                    <td class="mono">#${p.id}</td>
                    <td><strong>${p.teacherName || p.teacherUsername}</strong></td>
                    <td><span class="mono">${p.studentId}</span></td>
                    <td><b>${p.studentName || "--"}</b></td>
                    <td><span class="badge badge-token">+${p.amount} ICTU</span></td>
                    <td style="max-width: 250px;">
                        <div>${p.reason}</div>
                        ${evidenceBtn}
                    </td>
                    <td>${statusBadge}</td>
                    <td>${actionButtons}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error("Load proposals error:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 1.5rem;">Lỗi kết nối máy chủ</td></tr>`;
    }
}

async function approveProposal(proposalId) {
    const proposal = currentAdminProposals.find(p => p.id === proposalId);
    if (!proposal) return;

    if (!confirm(`Xác nhận phê duyệt đề xuất khen thưởng ${proposal.amount} ICTU cho sinh viên ${proposal.studentName} (${proposal.studentId})?\n\nLệnh này sẽ thực hiện gửi giao dịch lên Smart Contract trên Blockchain.`)) {
        return;
    }

    showToast("⏳ Đang gửi giao dịch lên Smart Contract Blockchain...", "info");

    let data = null;
    try {
        const response = await fetch(`${API}/proposals/${proposalId}/approve`, {
            method: "POST",
            headers: authHeader()
        });

        data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Phê duyệt thất bại", "error");
            return;
        }
    } catch (err) {
        console.error("Approve proposal network error:", err);
        showToast("Lỗi kết nối khi gửi giao dịch Blockchain: " + err.message, "error");
        return;
    }

    // Hiển thị thông báo phê duyệt thành công
    showToast("🎉 Phê duyệt thành công! Token đã được ghi nhận trên Blockchain.", "success");

    // Hiển thị biên lai điện tử trong khối try/catch an toàn
    try {
        if (typeof showTxReceiptModal === "function") {
            showTxReceiptModal({
                title: "Biên lai Phê duyệt Đề xuất Giảng viên",
                name: proposal.studentName,
                studentId: proposal.studentId,
                wallet: proposal.studentWallet,
                amount: proposal.amount,
                reason: proposal.reason,
                txHash: data.transactionHash,
                blockNumber: data.blockNumber,
                gasUsed: data.gasUsed,
                time: new Date().toLocaleString("vi-VN")
            });
        }
    } catch (modalErr) {
        console.warn("Lỗi mở modal biên lai:", modalErr);
    }

    // Làm mới dữ liệu UI ngầm (bọc riêng để lỗi render UI không làm bật toast báo lỗi Blockchain)
    try {
        await loadAdminProposals();
        await loadStats();
        await loadHistory(1);
        await loadLeaderboard();
    } catch (uiErr) {
        console.warn("Cảnh báo làm mới UI sau phê duyệt:", uiErr);
    }
}

async function rejectProposal(proposalId) {
    const reason = prompt("Nhập lý do từ chối đề xuất này (tùy chọn):", "Chưa đáp ứng đủ tiêu chuẩn khen thưởng");
    if (reason === null) return; // user cancelled

    let data = null;
    try {
        const response = await fetch(`${API}/proposals/${proposalId}/reject`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ rejectReason: reason })
        });

        data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Từ chối thất bại", "error");
            return;
        }
    } catch (err) {
        console.error("Reject proposal network error:", err);
        showToast("Lỗi máy chủ khi từ chối đề xuất", "error");
        return;
    }

    showToast("Đã từ chối đề xuất khen thưởng", "info");

    try {
        await loadAdminProposals();
    } catch (uiErr) {
        console.warn("Lỗi làm mới danh sách đề xuất:", uiErr);
    }
}

// Bí danh tương thích (Aliases)
const loadProposals = loadAdminProposals;
const displayTxReceipt = showTxReceiptModal;

// ==========================================
// Admin Whitelist Management (SSO)
// ==========================================
async function loadWhitelistTable() {
    const tbody = document.getElementById("whitelistTableBody");
    if (!tbody) return;

    try {
        const response = await fetch(`${API_BASE}/auth/whitelist`);
        const whitelist = await response.json();

        if (!Array.isArray(whitelist) || whitelist.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có tài khoản giảng viên nào trong Whitelist.</td></tr>`;
            return;
        }

        let html = "";
        whitelist.forEach(item => {
            html += `
                <tr>
                    <td class="mono">#${item.id}</td>
                    <td><strong>${item.name}</strong></td>
                    <td><code class="mono" style="color: var(--primary);">${item.email}</code></td>
                    <td>${item.department || "Khoa CNTT"}</td>
                    <td>
                        <span class="badge badge-success">
                            Được phép SSO
                        </span>
                    </td>
                    <td style="font-size: 0.82rem; color: var(--text-muted);">${formatDate(item.createdAt)}</td>
                    <td>
                        <button class="btn btn-outline-danger btn-xs" onclick="deleteWhitelist(${item.id}, '${item.email}')">
                            Thu hồi
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;

    } catch (err) {
        console.error("Load whitelist table error:", err);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger); padding: 1.5rem;">Lỗi tải danh sách Whitelist</td></tr>`;
    }
}

async function handleAddWhitelist(event) {
    event.preventDefault();
    const emailInput = document.getElementById("wlEmail");
    const nameInput = document.getElementById("wlName");
    const deptInput = document.getElementById("wlDept");
    const submitBtn = document.getElementById("btnSubmitWl");

    const email = emailInput.value.trim().toLowerCase();
    const name = nameInput.value.trim();
    const department = deptInput.value.trim();

    if (!email.endsWith("@ictu.edu.vn")) {
        showToast("Email phải có đuôi trường '@ictu.edu.vn'!", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = "⏳ Đang cấp quyền...";

    try {
        const response = await fetch(`${API_BASE}/auth/whitelist`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ email, name, department, role: "TEACHER" })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Cấp quyền thất bại", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "➕ Cấp quyền";
            return;
        }

        showToast(`🎉 ${data.message}`, "success");
        emailInput.value = "";
        nameInput.value = "";
        await loadWhitelistTable();

    } catch (err) {
        console.error("Add whitelist error:", err);
        showToast("Lỗi kết nối máy chủ", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "➕ Cấp quyền";
    }
}

async function deleteWhitelist(id, email) {
    if (!confirm(`Xác nhận thu hồi quyền truy cập SSO của giảng viên (${email})?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/whitelist/${id}`, {
            method: "DELETE",
            headers: authHeader()
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Thu hồi quyền thất bại", "error");
            return;
        }

        showToast("Đã thu hồi quyền truy cập SSO", "info");
        await loadWhitelistTable();

    } catch (err) {
        console.error("Delete whitelist error:", err);
        showToast("Lỗi máy chủ", "error");
    }
}

// Start application
window.addEventListener("DOMContentLoaded", initApp);