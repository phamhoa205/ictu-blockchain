// ==========================================
// Teacher Portal Logic (teacher.js)
// ==========================================

const teacherUser = checkTeacher();

const REWARD_API = `${API_BASE}/reward`;
const STUDENT_API = `${API_BASE}/student`;

let allStudentsList = [];

document.addEventListener("DOMContentLoaded", async () => {
    initTeacherProfile();
    await loadStudentsDropdown();
    await loadMyProposals();
});

function initTeacherProfile() {
    if (!teacherUser) return;
    const teacherNameEl = document.getElementById("teacherNameDisplay");
    const avatarEl = document.getElementById("teacherAvatar");

    const displayName = teacherUser.name || teacherUser.teacherName || "TS. Nguyễn Văn Thành";
    if (teacherNameEl) teacherNameEl.textContent = displayName;
    if (avatarEl) avatarEl.textContent = displayName.substring(0, 2).toUpperCase();
}

// Helper: Kiểm tra mã sinh viên chuẩn ICTU (DTC + 9 chữ số)
function getValidDtcStudentId(student) {
    if (!student) return "";
    const DTC_REGEX = /^dtc\d{9}$/i;
    
    // 1. Kiểm tra trường studentId
    const rawId = (student.studentId || "").trim();
    if (DTC_REGEX.test(rawId)) {
        return rawId.toUpperCase();
    }

    // 2. Kiểm tra phần tên trước @ của email nếu có
    if (student.email) {
        const emailPrefix = student.email.split("@")[0].trim();
        if (DTC_REGEX.test(emailPrefix)) {
            return emailPrefix.toUpperCase();
        }
    }

    // Không khớp định dạng DTC + 9 số -> trả về rỗng
    return "";
}

// ==========================================
// Load Students for Dropdown
// ==========================================
async function loadStudentsDropdown() {
    const select = document.getElementById("proposalStudentSelect");
    const metricStudents = document.getElementById("metricTotalStudents");
    if (!select) return;

    try {
        const response = await fetch(STUDENT_API, {
            headers: authHeader()
        });

        if (!response.ok) {
            select.innerHTML = `<option value="">Không thể tải danh sách sinh viên</option>`;
            return;
        }

        const data = await response.json();
        const students = Array.isArray(data) ? data : (data.data || []);
        allStudentsList = students;

        if (metricStudents) {
            metricStudents.textContent = students.length;
        }

        if (students.length === 0) {
            select.innerHTML = `<option value="">Chưa có sinh viên nào trong hệ thống</option>`;
            return;
        }

        let options = `<option value="">-- Chọn sinh viên ICTU cần đề xuất --</option>`;
        students.forEach(st => {
            const validId = getValidDtcStudentId(st);
            let label = "";
            if (validId) {
                label = `${validId} - ${st.name || st.email}`;
            } else {
                // Tài khoản không phải mã DTC + 9 số: chỉ hiển thị email/tên mà không gắn mã sinh viên giả phía trước
                if (st.email && st.name && st.email.toLowerCase() !== st.name.toLowerCase()) {
                    label = `${st.name} (${st.email})`;
                } else {
                    label = st.email || st.name || st.studentId;
                }
            }
            options += `<option value="${st.studentId}">${label}</option>`;
        });
        select.innerHTML = options;

    } catch (err) {
        console.error("Load students dropdown error:", err);
        select.innerHTML = `<option value="">Lỗi kết nối máy chủ</option>`;
    }
}

function handleStudentSelectChange() {
    const select = document.getElementById("proposalStudentSelect");
    const previewBox = document.getElementById("selectedStudentPreview");
    const emailEl = document.getElementById("previewStudentEmail") || document.getElementById("previewStudentName");
    const idEl = document.getElementById("previewStudentId");
    const walletEl = document.getElementById("previewStudentWallet");

    const selectedId = select.value;
    if (!selectedId) {
        previewBox.style.display = "none";
        return;
    }

    const student = allStudentsList.find(s => s.studentId.toLowerCase() === selectedId.toLowerCase());
    if (student) {
        // 1. Hiển thị Gmail của sinh viên
        if (emailEl) {
            emailEl.textContent = student.email || "--";
        }

        // 2. Mã SV: chỉ hiển thị nếu là DTC + đúng 9 số, ngược lại để trống hoàn toàn
        const validId = getValidDtcStudentId(student);
        if (idEl) {
            idEl.textContent = validId;
        }

        // 3. Địa chỉ ví nhận thưởng
        if (walletEl) {
            walletEl.textContent = student.wallet || "--";
        }

        previewBox.style.display = "block";
    } else {
        previewBox.style.display = "none";
    }
}

// ==========================================
// Submit Reward Proposal
// ==========================================
async function handleProposalSubmit(event) {
    event.preventDefault();
    const select = document.getElementById("proposalStudentSelect");
    const amountInput = document.getElementById("proposalAmount");
    const reasonInput = document.getElementById("proposalReason");
    const submitBtn = document.getElementById("submitProposalBtn");

    const studentId = select.value;
    const amount = Number(amountInput.value);
    const reason = reasonInput.value.trim();

    if (!studentId || !amount || !reason) {
        showToast("Vui lòng nhập đầy đủ thông tin đề xuất", "warning");
        return;
    }

    if (amount <= 0 || !Number.isInteger(amount)) {
        showToast("Số token phải là số nguyên dương lớn hơn 0", "warning");
        return;
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon" style="animation: spin 1s linear infinite;">
            <line x1="12" y1="2" x2="12" y2="6"></line>
            <line x1="12" y1="18" x2="12" y2="22"></line>
            <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
            <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
            <line x1="2" y1="12" x2="6" y2="12"></line>
            <line x1="18" y1="12" x2="22" y2="12"></line>
            <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
            <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
        </svg>
        <span>Đang gửi đề xuất...</span>
    `;

    const evidence = window.currentEvidence && window.currentEvidence.proposal ? window.currentEvidence.proposal : null;

    try {
        const response = await fetch(`${REWARD_API}/proposals`, {
            method: "POST",
            headers: authHeader(),
            body: JSON.stringify({ 
                studentId, 
                amount, 
                reason,
                evidenceFileName: evidence ? evidence.fileName : null,
                evidenceFileData: evidence ? evidence.fileData : null,
                evidenceHash: evidence ? evidence.fileHash : null
            })
        });

        const data = await response.json();

        if (!response.ok) {
            showToast(data.error || "Gửi đề xuất thất bại", "error");
            submitBtn.disabled = false;
            submitBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
                <span>Gửi Đề Xuất Phê Duyệt</span>
            `;
            return;
        }

        showToast("Đề xuất khen thưởng đã được gửi thành công tới Ban Quản trị!", "success");
        amountInput.value = "";
        reasonInput.value = "";
        select.value = "";
        handleStudentSelectChange();
        if (typeof clearEvidenceFile === "function") {
            clearEvidenceFile("proposal");
        }

        await loadMyProposals();

    } catch (err) {
        console.error("Submit proposal error:", err);
        showToast("Lỗi kết nối máy chủ backend", "error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            <span>Gửi Đề Xuất Phê Duyệt</span>
        `;
    }
}

// ==========================================
// Navigation & Mobile Drawer Helpers
// ==========================================
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

function switchTeacherTab(tabName) {
    const titleEl = document.getElementById("currentSectionTitle");
    const navItems = document.querySelectorAll(".sidebar-nav-item");

    navItems.forEach(item => {
        if (item.dataset.tab === tabName) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    closeMobileSidebar();

    if (tabName === "proposals") {
        if (titleEl) titleEl.textContent = "Danh sách Đề xuất của tôi";
        const target = document.getElementById("proposalsPanel");
        if (target) {
            target.scrollIntoView({ behavior: "smooth" });
        }
    } else {
        if (titleEl) titleEl.textContent = "Tổng quan & Lập đề xuất";
        const target = document.getElementById("proposalFormPanel") || document.getElementById("adminContentArea");
        if (target) {
            target.scrollIntoView({ behavior: "smooth" });
        }
    }
}

// ==========================================
// Load Teacher's Proposals
// ==========================================
async function loadMyProposals() {
    const tbody = document.getElementById("proposalsTableBody");
    const metricPending = document.getElementById("metricPendingProposals");
    const metricApproved = document.getElementById("metricApprovedProposals");

    try {
        const response = await fetch(`${REWARD_API}/proposals`, {
            headers: authHeader()
        });

        if (!response.ok) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 1.5rem;">Không thể tải danh sách đề xuất</td></tr>`;
            return;
        }

        const proposals = await response.json();

        let pendingCount = 0;
        let approvedCount = 0;

        if (proposals.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 2rem;">Chưa có đề xuất khen thưởng nào được tạo.</td></tr>`;
            if (metricPending) metricPending.textContent = 0;
            if (metricApproved) metricApproved.textContent = 0;
            return;
        }

        let html = "";
        proposals.forEach(p => {
            if (p.status === "PENDING") pendingCount++;
            if (p.status === "APPROVED") approvedCount++;

            let statusBadge = "";
            if (p.status === "PENDING") {
                statusBadge = `<span class="badge badge-warning">Chờ duyệt</span>`;
            } else if (p.status === "APPROVED") {
                statusBadge = `<span class="badge badge-success">Đã ký Blockchain</span>`;
            } else {
                statusBadge = `<span class="badge badge-danger" title="${p.rejectReason || ''}">Từ chối</span>`;
            }

            let txDisplay = "--";
            if (p.transactionHash) {
                txDisplay = `
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <a href="https://ibn.ictu.edu.vn/explorer" target="_blank" rel="noopener noreferrer" class="mono recent-tx-link" title="Xem trên IBN Explorer">${shortAddress(p.transactionHash)} ↗</a>
                        <button class="btn-copy-icon" onclick="copyToClipboard('${p.transactionHash}', 'Mã Tx')" title="Sao chép Tx Hash">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                        </button>
                    </div>
                `;
            }

            let evidenceBtn = "";
            if (p.evidence_name || p.evidence_hash) {
                evidenceBtn = `
                    <div style="margin-top: 4px;">
                        <button class="btn btn-secondary btn-sm" onclick="viewEvidence(${JSON.stringify({
                            name: p.evidence_name,
                            hash: p.evidence_hash,
                            data: p.evidence_data,
                            studentName: p.studentName,
                            studentId: p.studentId,
                            reason: p.reason
                        }).replace(/"/g, '&quot;')})" style="padding: 2px 8px; font-size: 0.74rem; border-color: var(--primary); color: var(--primary); display: inline-flex; align-items: center; gap: 4px;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
                            </svg>
                            <span>Xem minh chứng</span>
                        </button>
                    </div>
                `;
            }

            const displayStudentId = /^dtc\d{9}$/i.test(p.studentId || "") ? p.studentId.toUpperCase() : "";

            html += `
                <tr>
                    <td class="mono">#${p.id}</td>
                    <td><strong>${displayStudentId}</strong></td>
                    <td>${p.studentName || "--"}</td>
                    <td><span class="badge badge-token">+${p.amount} ICTU</span></td>
                    <td style="max-width: 250px;">
                        <div>${p.reason}</div>
                        ${evidenceBtn}
                    </td>
                    <td>${statusBadge}</td>
                    <td>${txDisplay}</td>
                    <td style="font-size: 0.82rem; color: var(--text-muted);">${formatDate(p.createdAt)}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (metricPending) metricPending.textContent = pendingCount;
        if (metricApproved) metricApproved.textContent = approvedCount;

    } catch (err) {
        console.error("Load proposals error:", err);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--danger); padding: 1.5rem;">Lỗi tải dữ liệu</td></tr>`;
    }
}
