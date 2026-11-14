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
            options += `<option value="${st.studentId}">${st.studentId} - ${st.name}</option>`;
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
    const nameEl = document.getElementById("previewStudentName");
    const idEl = document.getElementById("previewStudentId");
    const walletEl = document.getElementById("previewStudentWallet");

    const selectedId = select.value;
    if (!selectedId) {
        previewBox.style.display = "none";
        return;
    }

    const student = allStudentsList.find(s => s.studentId.toLowerCase() === selectedId.toLowerCase());
    if (student) {
        nameEl.textContent = student.name;
        idEl.textContent = student.studentId;
        walletEl.textContent = student.wallet;
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
    submitBtn.innerHTML = "⏳ Đang gửi đề xuất...";

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
            submitBtn.innerHTML = "🚀 Gửi Đề Xuất Phê Duyệt";
            return;
        }

        showToast("🎉 Đề xuất khen thưởng đã được gửi thành công tới Ban Quản trị!", "success");
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
        submitBtn.innerHTML = "🚀 Gửi Đề Xuất Phê Duyệt";
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
                statusBadge = `<span class="badge" style="background: #fef3c7; color: #b45309; font-weight: 600;">⏳ Chờ duyệt</span>`;
            } else if (p.status === "APPROVED") {
                statusBadge = `<span class="badge" style="background: #d1fae5; color: #065f46; font-weight: 600;">✅ Đã ký Blockchain</span>`;
            } else {
                statusBadge = `<span class="badge" style="background: #fee2e2; color: #b91c1c; font-weight: 600;" title="${p.rejectReason || ''}">❌ Từ chối</span>`;
            }

            let txDisplay = "--";
            if (p.transactionHash) {
                txDisplay = `
                    <div style="display: flex; align-items: center; gap: 4px;">
                        <span class="mono" style="color: var(--primary); font-size: 0.8rem;">${shortAddress(p.transactionHash)}</span>
                        <button class="btn btn-icon btn-sm" onclick="copyToClipboard('${p.transactionHash}', 'Mã Tx')">📋</button>
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
                        }).replace(/"/g, '&quot;')})" style="padding: 2px 8px; font-size: 0.74rem; border-color: var(--primary); color: var(--primary);">
                            📎 Xem minh chứng
                        </button>
                    </div>
                `;
            }

            html += `
                <tr>
                    <td class="mono">#${p.id}</td>
                    <td><strong>${p.studentId}</strong></td>
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
