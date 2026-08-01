/* ===== نظام CRM - المنطق والتفاعل ===== */
(function () {
    "use strict";

    const STORE = {
        customers: "crm_customers",
        followups: "crm_followups",
        tasks: "crm_tasks",
        settings: "crm_settings"
    };

    /* ---------- الحالة العامة ---------- */
    let state = {
        customers: [],
        followups: [],
        tasks: [],
        settings: {
            companyName: "نظام CRM",
            employeeName: "",
            employees: [],
            sources: ["إعلان", "تليفون", "واتساب", "فيسبوك", "زيارة", "إحالة"]
        },
        currentView: "dashboard",
        filters: { status: "all", source: "all", employee: "all", search: "" },
        followupTab: "pending",
        activityTab: "followup",
        taskStatus: "all"
    };

    const STATUS_COLORS = {
        "جديد": "st-new",
        "قيد الإجراء": "st-action",
        "قيد التنفيذ": "st-ongoing",
        "منجز": "st-done",
        "مغلق": "st-closed",
        "غير متواصل": "st-nocontact",
        "تدوير": "st-rotation",
        "تمويل": "st-funding"
    };

    const ACTIVITY_TYPES = [
        { v: "مكالمة", i: "📞" },
        { v: "واتساب", i: "💬" },
        { v: "اجتماع", i: "🤝" },
        { v: "بريد إلكتروني", i: "📧" },
        { v: "زيارة", i: "🏢" },
        { v: "عرض سعر", i: "📄" },
        { v: "عقد / اتفاق", i: "✍️" },
        { v: "متابعة", i: "🔔" },
        { v: "أخرى", i: "📌" }
    ];

    const ACTIVITY_ICON = {};
    ACTIVITY_TYPES.forEach(a => ACTIVITY_ICON[a.v] = a.i);

    /* ---------- أدوات مساعدة ---------- */
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const uid = () => "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);

    const todayISO = () => {
        const d = new Date();
        return d.toISOString();
    };

    function fmtDate(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        if (isNaN(d)) return "-";
        return d.toLocaleString("ar-EG", {
            year: "numeric", month: "short", day: "numeric",
            hour: "2-digit", minute: "2-digit"
        });
    }

    function fmtDateOnly(iso) {
        if (!iso) return "-";
        const d = new Date(iso);
        if (isNaN(d)) return "-";
        return d.toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    }

    function daysBetween(iso) {
        if (!iso) return null;
        const d = new Date(iso);
        if (isNaN(d)) return null;
        const now = new Date();
        return Math.ceil((d - now) / 86400000);
    }

    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));

    /* ---------- تخزين ---------- */
    function load() {
        try {
            state.customers = JSON.parse(localStorage.getItem(STORE.customers)) || [];
            state.followups = JSON.parse(localStorage.getItem(STORE.followups)) || [];
            state.tasks = JSON.parse(localStorage.getItem(STORE.tasks)) || [];
            const s = JSON.parse(localStorage.getItem(STORE.settings));
            if (s) state.settings = Object.assign({}, state.settings, s);
        } catch (e) {
            console.error("فشل تحميل البيانات:", e);
        }
    }

    function save() {
        try {
            localStorage.setItem(STORE.customers, JSON.stringify(state.customers));
            localStorage.setItem(STORE.followups, JSON.stringify(state.followups));
            localStorage.setItem(STORE.tasks, JSON.stringify(state.tasks));
            localStorage.setItem(STORE.settings, JSON.stringify(state.settings));
        } catch (e) {
            console.error("فشل حفظ البيانات:", e);
            toast("تنبيه: المساحة التخزينية ممتلئة، احذف بعض البيانات.");
        }
    }

    /* ---------- بيانات تجريبية ---------- */
    function seedData() {
        if (localStorage.getItem(STORE.customers)) return;
        const now = new Date();
        const daysFromNow = (n) => new Date(now.getTime() + n * 86400000).toISOString();

        const employees = ["أحمد محمود", "سارة علي", "محمد حسن"];
        const sources = ["فيسبوك", "تليفون", "إعلان"];

        const sample = [
            { name: "شركة النور للتجارة", phone: "01012345678", status: "قيد الإجراء", source: sources[0], emp: employees[0], value: 45000, fwd: daysFromNow(1) },
            { name: "مصطفى كامل", phone: "01123456789", status: "جديد", source: sources[1], emp: employees[1], value: 12000, fwd: daysFromNow(2) },
            { name: "مؤسسة الأمل", phone: "01234567890", status: "قيد التنفيذ", source: sources[2], emp: employees[2], value: 89000, fwd: daysFromNow(-1) },
            { name: "عبد الرحمن صالح", phone: "01098765432", status: "منجز", source: sources[0], emp: employees[1], value: 23000, fwd: daysFromNow(-3) },
            { name: "شركة المستقبل", phone: "01111111111", status: "مغلق", source: sources[1], emp: employees[0], value: 150000, fwd: null },
            { name: "كريم رمضان", phone: "01222222222", status: "غير متواصل", source: sources[2], emp: employees[2], value: 0, fwd: null },
            { name: "سلمى يوسف", phone: "01033333333", status: "تدوير", source: sources[0], emp: employees[1], value: 8000, fwd: daysFromNow(4) },
            { name: "حسام الدين", phone: "01144444444", status: "تمويل", source: sources[1], emp: employees[0], value: 67000, fwd: daysFromNow(3) }
        ];

        sample.forEach((s, idx) => {
            const id = uid();
            const created = daysFromNow(-idx * 2 - 1);
            const act = [
                { id: uid(), type: "مكالمة", date: created, note: "بداية التواصل مع العميل", emp: s.emp }
            ];
            state.customers.push({
                id, name: s.name, phone: s.phone, status: s.status, source: s.source,
                employee: s.emp, value: s.value, notes: "",
                followupDate: s.fwd, createdAt: created, activities: act
            });
        });

        state.followups.push(
            { id: uid(), customerId: state.customers[0].id, type: "مكالمة", date: daysFromNow(1), employee: employees[0], notes: "متابعة العرض", status: "قادمة" },
            { id: uid(), customerId: state.customers[2].id, type: "اجتماع", date: daysFromNow(-1), employee: employees[2], notes: "تأخر الاجتماع", status: "متأخرة" },
            { id: uid(), customerId: state.customers[3].id, type: "واتساب", date: daysFromNow(-3), employee: employees[1], notes: "تم إرسال العرض", status: "تمت" }
        );

        state.tasks.push(
            { id: uid(), title: "تجهيز تقرير المبيعات الأسبوعي", emp: employees[0], status: "قيد التنفيذ", dueDate: daysFromNow(2).slice(0, 10), priority: "عالية", desc: "تجميع أرقام المبيعات" },
            { id: uid(), title: "مراجعة ملفات العملاء المعلقة", emp: employees[1], status: "معلقة", dueDate: daysFromNow(5).slice(0, 10), priority: "متوسطة", desc: "" }
        );

        state.settings.employees = employees;
        save();
    }

    /* ---------- التنقل بين الأقسام ---------- */
    function switchView(view) {
        state.currentView = view;
        $$(".view").forEach(v => v.classList.remove("active"));
        const el = $("#view-" + view);
        if (el) el.classList.add("active");
        $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
        if (window.innerWidth <= 992) closeSidebar();
        renderAll();
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function openSidebar() {
        $("#sidebar").classList.add("open");
        $("#overlay").hidden = false;
    }

    function closeSidebar() {
        $("#sidebar").classList.remove("open");
        $("#overlay").hidden = true;
    }

    /* ---------- حساب المؤشرات ---------- */
    function statusCount(status) {
        return state.customers.filter(c => c.status === status).length;
    }

    function computeKpis() {
        const delayedCount = state.followups.filter(f => f.status === "متأخرة" && f.date).length;
        const todayStr = new Date().toISOString().slice(0, 10);
        const todayActivities = state.customers.reduce((acc, c) =>
            acc + (c.activities || []).filter(a => (a.date || "").slice(0, 10) === todayStr).length, 0);
        const todayComments = state.followups.filter(f => f.notes && (f.date || "").slice(0, 10) === todayStr).length;

        return {
            total: state.customers.length,
            done: statusCount("منجز"),
            action: statusCount("قيد الإجراء"),
            ongoing: statusCount("قيد التنفيذ"),
            fresh: statusCount("جديد"),
            nocontact: statusCount("غير متواصل"),
            delayed: delayedCount,
            rotation: statusCount("تدوير"),
            todayActivities,
            followups: state.followups.filter(f => f.status !== "تمت").length,
            sales: statusCount("تمويل"),
            closed: statusCount("مغلق"),
            comments: todayComments
        };
    }

    /* ---------- عرض لوحة التحكم ---------- */
    function renderDashboard() {
        const k = computeKpis();
        $("#kpiTotal").textContent = k.total;
        $("#kpiDone").textContent = k.done;
        $("#kpiAction").textContent = k.action;
        $("#kpiOngoing").textContent = k.ongoing;
        $("#kpiNew").textContent = k.fresh;
        $("#kpiNoContact").textContent = k.nocontact;
        $("#kpiDelayed").textContent = k.delayed;
        $("#kpiRotation").textContent = k.rotation;
        $("#kpiTodayActivities").textContent = k.todayActivities;
        $("#kpiFollowUps").textContent = k.followups;
        $("#kpiSales").textContent = k.sales;
        $("#kpiClosed").textContent = k.closed;
        $("#kpiComments").textContent = k.comments;

        $("#todayDate").textContent = "اليوم: " + fmtDateOnly(new Date().toISOString());

        $("#navFollowupCount").hidden = k.followups === 0;
        $("#navFollowupCount").textContent = k.followups;

        renderActivityContent();
        renderStatusDistribution();
    }

    function renderActivityContent() {
        const tab = state.activityTab;
        const sevenDays = 7 * 86400000;
        const now = new Date().getTime();

        let list = state.followups.filter(f => f.date);
        if (tab === "followup") {
            list = list.filter(f => {
                const diff = new Date(f.date).getTime() - now;
                return diff >= 0 && diff <= sevenDays;
            }).sort((a, b) => new Date(a.date) - new Date(b.date));
        } else if (tab === "delayed") {
            list = list.filter(f => f.status === "متأخرة" || new Date(f.date).getTime() < now);
        } else {
            list = list.sort((a, b) => new Date(a.date) - new Date(b.date));
        }

        const box = $("#activityContent");
        if (!list.length) {
            box.innerHTML = '<p class="empty-text">لا توجد أنشطة في هذه الفئة</p>';
            return;
        }

        box.innerHTML = list.map(f => {
            const cust = state.customers.find(c => c.id === f.customerId);
            const name = cust ? cust.name : "عميل محذوف";
            const delayed = new Date(f.date).getTime() < now && f.status !== "تمت";
            const done = f.status === "تمت";
            const cls = delayed ? "delayed" : (done ? "done" : "");
            const icon = ACTIVITY_ICON[f.type] || "🔔";
            return `
                <div class="activity-item ${cls}">
                    <span class="act-type">${icon}</span>
                    <div class="act-main">
                        <b>${esc(name)}</b>
                        <span>${esc(f.type)} - ${esc(f.employee || "غير محدد")}</span>
                    </div>
                    <span class="act-date">${fmtDate(f.date)}${delayed ? ' <b style="color:#ef4444">(متأخرة)</b>' : ""}</span>
                </div>`;
        }).join("");
    }

    function renderStatusDistribution() {
        const statuses = ["جديد", "قيد الإجراء", "قيد التنفيذ", "منجز", "مغلق", "غير متواصل", "تدوير", "تمويل"];
        const total = Math.max(state.customers.length, 1);
        const colors = {
            "جديد": "#3b82f6", "قيد الإجراء": "#f97316", "قيد التنفيذ": "#8b5cf6",
            "منجز": "#22c55e", "مغلق": "#64748b", "غير متواصل": "#94a3b8",
            "تدوير": "#06b6d4", "تمويل": "#ec4899"
        };
        const box = $("#statusDistribution");
        box.innerHTML = statuses.map(st => {
            const count = statusCount(st);
            const pct = Math.round((count / total) * 100);
            return `
                <div class="dist-row">
                    <span class="dist-label">${esc(st)}</span>
                    <div class="dist-bar"><div class="dist-fill" style="width:${pct}%;background:${colors[st]}"></div></div>
                    <span class="dist-count">${count}</span>
                </div>`;
        }).join("");
    }

    /* ---------- عرض العملاء ---------- */
    function getFilteredCustomers() {
        const { status, source, employee, search } = state.filters;
        const q = search.trim().toLowerCase();
        return state.customers.filter(c => {
            if (status !== "all" && c.status !== status) return false;
            if (source !== "all" && c.source !== source) return false;
            if (employee !== "all" && c.employee !== employee) return false;
            if (q) {
                const hay = (c.name + " " + c.phone + " " + c.notes).toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }

    function renderCustomers() {
        // خيارات الفلاتر
        const statusSel = $("#statusFilter");
        const curStatus = statusSel.value || "all";
        statusSel.innerHTML = '<option value="all">كل الحالات</option>' +
            Object.keys(STATUS_COLORS).map(s => `<option value="${s}">${s}</option>`).join("");
        statusSel.value = curStatus;

        const sourceSel = $("#sourceFilter");
        const curSource = sourceSel.value || "all";
        sourceSel.innerHTML = '<option value="all">كل المصادر</option>' +
            state.settings.sources.map(s => `<option>${esc(s)}</option>`).join("");
        sourceSel.value = curSource;

        const empSel = $("#employeeFilter");
        const curEmp = empSel.value || "all";
        empSel.innerHTML = '<option value="all">كل الموظفين</option>' +
            state.settings.employees.map(s => `<option>${esc(s)}</option>`).join("");
        empSel.value = curEmp;

        const list = getFilteredCustomers();
        const activeStatus = $("#statusFilter").value;

        const byStatus = {};
        list.forEach(c => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
        $("#customersSummary").innerHTML =
            `<span>عرض <b>${list.length}</b> من أصل <b>${state.customers.length}</b> عميل</span>` +
            Object.entries(byStatus).map(([s, n]) =>
                `<span>${esc(s)}: <b>${n}</b></span>`).join("");

        const body = $("#customersBody");
        if (!list.length) {
            body.innerHTML = `<tr><td colspan="7" class="empty-text">لا يوجد عملاء مطابقون${activeStatus !== "all" ? " في الحالة " + activeStatus : ""}</td></tr>`;
            return;
        }

        body.innerHTML = list.map(c => {
            const lastAct = (c.activities && c.activities.length)
                ? c.activities[c.activities.length - 1] : null;
            const cls = STATUS_COLORS[c.status] || "st-default";
            return `
                <tr>
                    <td class="cell-name">
                        <b>${esc(c.name)}</b>
                        <span>${esc(c.source || "-")} · ${c.value ? "💰 " + (+c.value).toLocaleString("ar-EG") : "بدون قيمة"}</span>
                    </td>
                    <td dir="ltr">${esc(c.phone || "-")}</td>
                    <td><span class="status-badge ${cls}">${esc(c.status)}</span></td>
                    <td>${esc(c.source || "-")}</td>
                    <td>${esc(c.employee || "-")}</td>
                    <td>${lastAct ? fmtDate(lastAct.date) : "-"}</td>
                    <td>
                        <div class="table-actions">
                            <button class="icon-btn" title="عرض الملف" onclick="CRM.openDetail('${c.id}')">👁️</button>
                            <button class="icon-btn" title="تعديل" onclick="CRM.editLead('${c.id}')">✏️</button>
                            <button class="icon-btn danger" title="حذف" onclick="CRM.deleteLead('${c.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>`;
        }).join("");
    }

    /* ---------- نموذج العميل ---------- */
    function openLeadModal(id) {
        const modal = $("#leadModal");
        modal.hidden = false;
        populateSourceAndEmp();

        if (id) {
            const c = state.customers.find(x => x.id === id);
            if (!c) return;
            $("#leadModalTitle").textContent = "تعديل بيانات العميل";
            $("#leadId").value = c.id;
            $("#leadName").value = c.name;
            $("#leadPhone").value = c.phone;
            $("#leadSource").value = c.source || "";
            $("#leadStatus").value = c.status;
            $("#leadEmployee").value = c.employee || "";
            $("#leadValue").value = c.value || "";
            $("#leadFollowupDate").value = c.followupDate ? c.followupDate.slice(0, 16) : "";
            $("#leadNotes").value = c.notes || "";
        } else {
            $("#leadModalTitle").textContent = "إضافة عميل جديد";
            $("#leadForm").reset();
            $("#leadId").value = "";
            $("#leadStatus").value = "جديد";
            $("#leadEmployee").value = state.settings.employeeName || "";
        }
    }

    function submitLead(e) {
        e.preventDefault();
        const id = $("#leadId").value;
        const name = $("#leadName").value.trim();
        if (!name) { toast("اسم العميل مطلوب"); return; }

        const data = {
            name,
            phone: $("#leadPhone").value.trim(),
            status: $("#leadStatus").value,
            source: $("#leadSource").value,
            employee: $("#leadEmployee").value,
            value: parseFloat($("#leadValue").value) || 0,
            followupDate: $("#leadFollowupDate").value || null,
            notes: $("#leadNotes").value.trim()
        };

        if (id) {
            const c = state.customers.find(x => x.id === id);
            if (!c) return;
            Object.assign(c, data);
            toast("تم تحديث بيانات العميل");
        } else {
            state.customers.unshift(Object.assign({
                id: uid(),
                activities: [],
                createdAt: todayISO()
            }, data));
            toast("تمت إضافة العميل بنجاح");
        }
        save();
        closeModal("leadModal");
        renderAll();
    }

    /* ---------- تفاصيل العميل وتتبع الملف ---------- */
    function openDetail(id) {
        const c = state.customers.find(x => x.id === id);
        if (!c) return;
        const modal = $("#detailModal");
        modal.hidden = false;

        const cls = STATUS_COLORS[c.status] || "st-default";
        const initials = c.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("");

        const activityOptions = ACTIVITY_TYPES.map(a =>
            `<option value="${a.v}">${a.i} ${a.v}</option>`).join("");

        const timeline = (c.activities || []).slice().reverse().map(a => `
            <div class="timeline-item">
                <h5>${ACTIVITY_ICON[a.type] || "📌"} ${esc(a.type)} ${a.emp ? "- " + esc(a.emp) : ""}</h5>
                <p>${esc(a.note || "بدون ملاحظات")}</p>
                <span class="tl-time">${fmtDate(a.date)}</span>
            </div>`).join("") || '<p class="empty-text">لا توجد أنشطة بعد - أضف أول نشاط لبدء تتبع الملف</p>';

        const empOptions = ['<option value="">غير محدد</option>']
            .concat(state.settings.employees.map(s => `<option>${esc(s)}</option>`)).join("");

        $("#detailContent").innerHTML = `
            <div class="detail-header">
                <div class="detail-avatar">${esc(initials)}</div>
                <div>
                    <h2>${esc(c.name)} <span class="status-badge ${cls}">${esc(c.status)}</span></h2>
                    <p class="detail-meta">${esc(c.phone || "بدون هاتف")} · ${esc(c.source || "بدون مصدر")} · المسؤول: ${esc(c.employee || "-")}</p>
                </div>
            </div>

            <div class="detail-grid">
                <div class="detail-cell"><div class="dc-label">قيمة الصفقة</div><div class="dc-value">${c.value ? (+c.value).toLocaleString("ar-EG") + " ج.م" : "-"}</div></div>
                <div class="detail-cell"><div class="dc-label">تاريخ الإضافة</div><div class="dc-value">${fmtDateOnly(c.createdAt)}</div></div>
                <div class="detail-cell"><div class="dc-label">موعد المتابعة القادمة</div><div class="dc-value">${fmtDate(c.followupDate)}</div></div>
                <div class="detail-cell"><div class="dc-label">عدد الأنشطة</div><div class="dc-value">${(c.activities || []).length}</div></div>
            </div>

            <div class="form-group">
                <label>تغيير حالة الملف (تتبع دورة حياة العميل)</label>
                <select id="detailStatus">
                    ${["جديد", "قيد الإجراء", "قيد التنفيذ", "منجز", "مغلق", "غير متواصل", "تدوير", "تمويل"]
                        .map(s => `<option ${c.status === s ? "selected" : ""}>${s}</option>`).join("")}
                </select>
            </div>

            <div class="form-group">
                <label>ملاحظات العميل</label>
                <textarea id="detailNotes" rows="2">${esc(c.notes || "")}</textarea>
            </div>

            <div class="panel-header" style="margin-top:6px"><h3>إضافة نشاط / متابعة على الملف</h3></div>
            <div class="activity-form-row">
                <select id="newActType">${activityOptions}</select>
                <input type="datetime-local" id="newActDate" value="${new Date().toISOString().slice(0, 16)}" />
                <select id="newActEmp">${empOptions}</select>
                <input type="text" id="newActNote" placeholder="ملاحظة النشاط..." />
                <button class="btn btn-primary" id="addActBtn">➕ إضافة</button>
            </div>

            <div class="panel-header"><h3>سجل النشاط (Timeline)</h3></div>
            <div class="timeline">${timeline}</div>

            <div class="modal-actions" style="margin-top:18px">
                <button class="btn btn-primary" id="detailSaveBtn">💾 حفظ التغييرات</button>
                <button class="btn btn-outline" data-close="detailModal">إغلاق</button>
            </div>`;

        $("#addActBtn").addEventListener("click", () => addActivity(id));
        $("#detailSaveBtn").addEventListener("click", () => saveDetail(id));
    }

    function addActivity(id) {
        const c = state.customers.find(x => x.id === id);
        if (!c) return;
        const type = $("#newActType").value;
        const date = $("#newActDate").value || todayISO();
        const emp = $("#newActEmp").value || c.employee || state.settings.employeeName;
        const note = $("#newActNote").value.trim();

        c.activities = c.activities || [];
        c.activities.push({ id: uid(), type, date: date.replace("T", "T") || date, note, emp });

        // تسجيل المتابعة كاملاً إذا كانت من نوع "متابعة" أو أي نوع
        state.followups.push({
            id: uid(), customerId: id, type, date,
            employee: emp, notes: note, status: "تمت"
        });

        save();
        toast("تم إضافة النشاط وتحديث الملف");
        openDetail(id);
        renderAll();
    }

    function saveDetail(id) {
        const c = state.customers.find(x => x.id === id);
        if (!c) return;
        const newStatus = $("#detailStatus").value;
        if (newStatus !== c.status) {
            const oldStatus = c.status;
            c.activities.push({
                id: uid(), type: "تغيير حالة",
                date: todayISO(), note: `تم تغيير الحالة من "${oldStatus}" إلى "${newStatus}"`,
                emp: state.settings.employeeName || ""
            });
            c.status = newStatus;
        }
        c.notes = $("#detailNotes").value.trim();
        save();
        toast("تم حفظ التغييرات");
        openDetail(id);
        renderAll();
    }

    /* ---------- حذف وتعديل ---------- */
    function editLead(id) { openLeadModal(id); }

    function deleteLead(id) {
        const c = state.customers.find(x => x.id === id);
        if (!c) return;
        if (!confirm("هل أنت متأكد من حذف العميل \"" + c.name + "\"؟ سيتم حذف كل الملفات والمتابعات المرتبطة.")) return;
        state.customers = state.customers.filter(x => x.id !== id);
        state.followups = state.followups.filter(f => f.customerId !== id);
        save();
        toast("تم حذف العميل");
        renderAll();
    }

    /* ---------- المتابعات ---------- */
    function renderFollowups() {
        const tab = state.followupTab;
        let list = state.followups.slice().sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
        if (tab === "pending") list = list.filter(f => f.status !== "تمت" && new Date(f.date || 0).getTime() >= new Date().getTime() - 86400000);
        else if (tab === "delayed") list = list.filter(f => new Date(f.date || 0).getTime() < new Date().getTime() && f.status !== "تمت");
        else if (tab === "done") list = list.filter(f => f.status === "تمت");

        const body = $("#followupsBody");
        if (!list.length) {
            body.innerHTML = '<tr><td colspan="6" class="empty-text">لا توجد متابعات هنا</td></tr>';
            return;
        }

        body.innerHTML = list.map(f => {
            const cust = state.customers.find(c => c.id === f.customerId);
            const cname = cust ? cust.name : "عميل محذوف";
            const overdue = new Date(f.date || 0).getTime() < new Date().getTime() && f.status !== "تمت";
            const done = f.status === "تمت";
            const badge = done
                ? '<span class="status-badge st-done">تمت</span>'
                : (overdue ? '<span class="status-badge st-nocontact">متأخرة</span>' : '<span class="status-badge st-action">قادمة</span>');
            return `
                <tr>
                    <td><b>${esc(cname)}</b></td>
                    <td>${esc(f.type)}</td>
                    <td dir="ltr">${fmtDate(f.date)}</td>
                    <td>${esc(f.employee || "-")}</td>
                    <td>${badge}</td>
                    <td>
                        <div class="table-actions">
                            ${done ? "" : `<button class="icon-btn" title="إتمام" onclick="CRM.completeFollowup('${f.id}')">✔️</button>`}
                            <button class="icon-btn" title="تعديل" onclick="CRM.editFollowup('${f.id}')">✏️</button>
                            <button class="icon-btn danger" title="حذف" onclick="CRM.deleteFollowup('${f.id}')">🗑️</button>
                        </div>
                    </td>
                </tr>`;
        }).join("");
    }

    function openFollowupModal(id) {
        $("#followupModal").hidden = false;
        populateCustomerSelect();
        populateSourceAndEmp();

        if (id) {
            const f = state.followups.find(x => x.id === id);
            if (!f) return;
            $("#followupId").value = f.id;
            $("#followupCustomer").value = f.customerId;
            $("#followupType").value = f.type;
            $("#followupDate").value = f.date ? f.date.slice(0, 16) : "";
            $("#followupEmployee").value = f.employee || "";
            $("#followupNotes").value = f.notes || "";
        } else {
            $("#followupForm").reset();
            $("#followupId").value = "";
            $("#followupEmployee").value = state.settings.employeeName || "";
        }
    }

    function submitFollowup(e) {
        e.preventDefault();
        const id = $("#followupId").value;
        const custId = $("#followupCustomer").value;
        if (!custId) { toast("اختر العميل"); return; }
        const data = {
            customerId: custId,
            type: $("#followupType").value,
            date: $("#followupDate").value || todayISO(),
            employee: $("#followupEmployee").value,
            notes: $("#followupNotes").value.trim()
        };
        const cust = state.customers.find(c => c.id === custId);

        if (id) {
            const f = state.followups.find(x => x.id === id);
            if (!f) return;
            Object.assign(f, data);
            toast("تم تحديث المتابعة");
        } else {
            data.id = uid();
            data.status = new Date(data.date) < new Date() ? "متأخرة" : "قادمة";
            state.followups.push(data);
            if (cust) cust.followupDate = data.date;
            toast("تمت إضافة المتابعة");
        }
        save();
        closeModal("followupModal");
        renderAll();
    }

    function completeFollowup(id) {
        const f = state.followups.find(x => x.id === id);
        if (!f) return;
        f.status = "تمت";
        save();
        toast("تم إتمام المتابعة ✔️");
        renderAll();
    }

    function editFollowup(id) { openFollowupModal(id); }

    function deleteFollowup(id) {
        if (!confirm("حذف هذه المتابعة؟")) return;
        state.followups = state.followups.filter(x => x.id !== id);
        save();
        toast("تم حذف المتابعة");
        renderAll();
    }

    /* ---------- المهام ---------- */
    function renderTasks() {
        const q = $("#taskSearchInput").value.trim().toLowerCase();
        const st = state.taskStatus;
        let list = state.tasks.filter(t => {
            if (st !== "all" && t.status !== st) return false;
            if (q && !(t.title + " " + t.desc).toLowerCase().includes(q)) return false;
            return true;
        });

        const box = $("#tasksList");
        if (!list.length) {
            box.innerHTML = '<p class="empty-text">لا توجد مهام</p>';
            return;
        }

        const prioOrder = { "عالية": 0, "متوسطة": 1, "عادية": 2 };
        list.sort((a, b) => (prioOrder[a.priority] ?? 2) - (prioOrder[b.priority] ?? 2));

        box.innerHTML = list.map(t => {
            const done = t.status === "تمت";
            const overdue = t.dueDate && t.dueDate < new Date().toISOString().slice(0, 10) && !done;
            return `
                <div class="task-card priority-${esc(t.priority)} ${done ? "done-task" : ""}">
                    <button class="task-check" title="تبديل الإتمام" onclick="CRM.toggleTask('${t.id}')">${done ? "✓" : ""}</button>
                    <div class="task-body">
                        <h4>${esc(t.title)}</h4>
                        ${t.desc ? `<p>${esc(t.desc)}</p>` : ""}
                        <div class="task-meta">
                            <span>👤 ${esc(t.emp || "-")}</span>
                            ${t.dueDate ? `<span>📅 ${fmtDateOnly(t.dueDate + "T00:00:00")}</span>` : ""}
                            <span>⚡ ${esc(t.priority)}</span>
                            ${overdue ? '<span style="color:#ef4444">⚠️ متأخرة</span>' : ""}
                        </div>
                    </div>
                    <div class="table-actions">
                        <button class="icon-btn" onclick="CRM.editTask('${t.id}')">✏️</button>
                        <button class="icon-btn danger" onclick="CRM.deleteTask('${t.id}')">🗑️</button>
                    </div>
                </div>`;
        }).join("");
    }

    function openTaskModal(id) {
        $("#taskModal").hidden = false;
        populateSourceAndEmp();
        if (id) {
            const t = state.tasks.find(x => x.id === id);
            if (!t) return;
            $("#taskId").value = t.id;
            $("#taskTitle").value = t.title;
            $("#taskEmployee").value = t.emp || "";
            $("#taskStatus").value = t.status;
            $("#taskDueDate").value = t.dueDate || "";
            $("#taskPriority").value = t.priority;
            $("#taskDesc").value = t.desc || "";
        } else {
            $("#taskForm").reset();
            $("#taskId").value = "";
            $("#taskEmployee").value = state.settings.employeeName || "";
        }
    }

    function submitTask(e) {
        e.preventDefault();
        const id = $("#taskId").value;
        const title = $("#taskTitle").value.trim();
        if (!title) { toast("عنوان المهمة مطلوب"); return; }
        const data = {
            title,
            emp: $("#taskEmployee").value,
            status: $("#taskStatus").value,
            dueDate: $("#taskDueDate").value || null,
            priority: $("#taskPriority").value,
            desc: $("#taskDesc").value.trim()
        };
        if (id) {
            const t = state.tasks.find(x => x.id === id);
            if (!t) return;
            Object.assign(t, data);
            toast("تم تحديث المهمة");
        } else {
            state.tasks.unshift(Object.assign({ id: uid() }, data));
            toast("تمت إضافة المهمة");
        }
        save();
        closeModal("taskModal");
        renderAll();
    }

    function toggleTask(id) {
        const t = state.tasks.find(x => x.id === id);
        if (!t) return;
        t.status = t.status === "تمت" ? "قيد التنفيذ" : "تمت";
        save();
        renderAll();
    }

    function editTask(id) { openTaskModal(id); }

    function deleteTask(id) {
        if (!confirm("حذف هذه المهمة؟")) return;
        state.tasks = state.tasks.filter(x => x.id !== id);
        save();
        toast("تم حذف المهمة");
        renderAll();
    }

    /* ---------- التقارير ---------- */
    function renderReports() {
        const k = computeKpis();
        const employees = state.settings.employees;

        const empStats = employees.map(emp => {
            const custs = state.customers.filter(c => c.employee === emp);
            const total = custs.reduce((s, c) => s + (c.value || 0), 0);
            const done = custs.filter(c => c.status === "منجز" || c.status === "مغلق").length;
            return { emp, count: custs.length, total, done };
        });

        const srcStats = state.settings.sources.map(src => {
            const custs = state.customers.filter(c => c.source === src);
            return { src, count: custs.length };
        });

        const totalValue = state.customers.reduce((s, c) => s + (c.value || 0), 0);
        const doneValue = state.customers.filter(c => c.status === "منجز" || c.status === "مغلق")
            .reduce((s, c) => s + (c.value || 0), 0);

        const closedCount = statusCount("مغلق") + statusCount("منجز");
        const conversion = state.customers.length ? Math.round((closedCount / state.customers.length) * 100) : 0;

        const delayed = state.followups.filter(f => f.status !== "تمت" && new Date(f.date || 0).getTime() < new Date().getTime());

        const box = $("#reportContent");
        box.innerHTML = `
            <div class="report-card">
                <h3>إجمالي قيمة الصفقات</h3>
                <div class="big-number">${(+totalValue).toLocaleString("ar-EG")}</div>
                <p class="hint">ج.م - إجمالي قيم كل العملاء</p>
                <div class="report-stat"><span>قيمة المنجز والمغلق</span><b>${(+doneValue).toLocaleString("ar-EG")}</b></div>
                <div class="report-stat"><span>عدد العملاء</span><b>${state.customers.length}</b></div>
            </div>

            <div class="report-card">
                <h3>معدلات الإنجاز</h3>
                <div class="report-stat"><span>عملاء مغلقين ومنجزين</span><b>${closedCount}</b></div>
                <div class="report-stat"><span>نسبة التحويل</span><b>${conversion}%</b></div>
                <div class="report-stat"><span>متابعات متأخرة</span><b style="color:${delayed.length ? "#ef4444" : "#22c55e"}">${delayed.length}</b></div>
                <div class="report-stat"><span>مهام معلقة</span><b>${state.tasks.filter(t => t.status !== "تمت").length}</b></div>
            </div>

            <div class="report-card">
                <h3>أداء الموظفين</h3>
                ${empStats.map(s => `
                    <div class="report-stat">
                        <span>${esc(s.emp)} <small style="color:#94a3b8">(${s.count} عميل)</small></span>
                        <b>${(+s.total).toLocaleString("ar-EG")}</b>
                    </div>`).join("") || '<p class="hint">أضف موظفين من الإعدادات</p>'}
            </div>

            <div class="report-card">
                <h3>العملاء حسب المصدر</h3>
                ${srcStats.map(s => `
                    <div class="report-stat"><span>${esc(s.src)}</span><b>${s.count}</b></div>`).join("") || '<p class="hint">أضف مصادر من الإعدادات</p>'}
            </div>

            <div class="report-card">
                <h3>دورة حياة الملفات</h3>
                ${Object.keys(STATUS_COLORS).map(st => {
                    const n = statusCount(st);
                    const pct = state.customers.length ? Math.round((n / state.customers.length) * 100) : 0;
                    return `<div class="report-stat"><span>${esc(st)}</span><b>${n} (${pct}%)</b></div>`;
                }).join("")}
            </div>`;
    }

    function printReport() {
        const header = `<div class="report-print-header">
            <h2>${esc(state.settings.companyName)} - تقرير شامل</h2>
            <p>تاريخ التقرير: ${fmtDateOnly(new Date().toISOString())}</p>
        </div>`;
        $("#reportContent").insertAdjacentHTML("afterbegin", header);
        window.print();
        const h = document.querySelector(".report-print-header");
        if (h) h.remove();
    }

    /* ---------- الإعدادات ---------- */
    function renderSettings() {
        $("#setCompanyName").value = state.settings.companyName || "";
        $("#setEmployeeName").value = state.settings.employeeName || "";
        $("#setEmployees").value = state.settings.employees.join("، ");
        $("#setSources").value = state.settings.sources.join("، ");
    }

    function saveSettings() {
        state.settings.companyName = $("#setCompanyName").value.trim() || "نظام CRM";
        state.settings.employeeName = $("#setEmployeeName").value.trim();
        state.settings.employees = $("#setEmployees").value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        state.settings.sources = $("#setSources").value.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        save();
        $("#brandTitle").textContent = state.settings.companyName;
        document.title = state.settings.companyName + " - لوحة التحكم";
        toast("تم حفظ الإعدادات");
        renderAll();
    }

    /* ---------- تعبئة القوائم ---------- */
    function populateSourceAndEmp() {
        $("#leadSource").innerHTML = '<option value="">بدون مصدر</option>' +
            state.settings.sources.map(s => `<option>${esc(s)}</option>`).join("");
        $("#leadEmployee").innerHTML = '<option value="">غير محدد</option>' +
            state.settings.employees.map(s => `<option>${esc(s)}</option>`).join("");
        $("#followupEmployee").innerHTML = '<option value="">غير محدد</option>' +
            state.settings.employees.map(s => `<option>${esc(s)}</option>`).join("");
        $("#taskEmployee").innerHTML = '<option value="">غير محدد</option>' +
            state.settings.employees.map(s => `<option>${esc(s)}</option>`).join("");
    }

    function populateCustomerSelect() {
        $("#followupCustomer").innerHTML = state.customers.map(c =>
            `<option value="${c.id}">${esc(c.name)} ${c.phone ? "- " + esc(c.phone) : ""}</option>`).join("");
    }

    /* ---------- تصدير / استيراد ---------- */
    function exportData() {
        const payload = {
            exportedAt: todayISO(),
            app: "crm-dashboard",
            version: 1,
            customers: state.customers,
            followups: state.followups,
            tasks: state.tasks,
            settings: state.settings
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "crm-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast("تم تصدير البيانات بنجاح");
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (!Array.isArray(data.customers)) throw new Error("صيغة غير صحيحة");
                state.customers = data.customers || [];
                state.followups = data.followups || [];
                state.tasks = data.tasks || [];
                if (data.settings) state.settings = Object.assign({}, state.settings, data.settings);
                save();
                toast("تم استيراد البيانات بنجاح ✔️");
                renderAll();
            } catch (err) {
                toast("فشل استيراد الملف - تأكد أنه ملف نسخة احتياطية صحيح");
            }
        };
        reader.readAsText(file);
    }

    function factoryReset() {
        if (!confirm("سيتم مسح كل البيانات نهائياً. هل أنت متأكد؟\nننصح بتصدير نسخة احتياطية أولاً.")) return;
        if (!confirm("تأكيد أخير: هل تريد فعلاً حذف كل شيء؟")) return;
        localStorage.removeItem(STORE.customers);
        localStorage.removeItem(STORE.followups);
        localStorage.removeItem(STORE.tasks);
        localStorage.removeItem(STORE.settings);
        location.reload();
    }

    /* ---------- توست ---------- */
    let toastTimer = null;
    function toast(msg) {
        const t = $("#toast");
        t.textContent = msg;
        t.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { t.hidden = true; }, 2500);
    }

    function closeModal(id) {
        $("#" + id).hidden = true;
    }

    /* ---------- العرض الكلي ---------- */
    function renderAll() {
        renderDashboard();
        renderCustomers();
        renderFollowups();
        renderTasks();
        renderReports();
        renderSettings();
        populateSourceAndEmp();
    }

    /* ---------- الأحداث ---------- */
    function bindEvents() {
        // التنقل
        $$(".nav-item").forEach(btn =>
            btn.addEventListener("click", () => switchView(btn.dataset.view)));

        $("#menuToggle").addEventListener("click", openSidebar);
        $("#overlay").addEventListener("click", closeSidebar);

        // تبويبات الأنشطة
        $$(".activity-tabs .tab[data-atab]").forEach(t =>
            t.addEventListener("click", () => {
                state.activityTab = t.dataset.atab;
                $$(".tab[data-atab]").forEach(x => x.classList.toggle("active", x === t));
                renderActivityContent();
            }));

        // تبويبات المتابعات
        $$(".tab[data-ftab]").forEach(t =>
            t.addEventListener("click", () => {
                state.followupTab = t.dataset.ftab;
                $$(".tab[data-ftab]").forEach(x => x.classList.toggle("active", x === t));
                renderFollowups();
            }));

        // إضافة عملاء
        $("#addLeadBtn").addEventListener("click", () => openLeadModal(null));
        $("#addLeadBtn2").addEventListener("click", () => openLeadModal(null));

        // نموذج العميل
        $("#leadForm").addEventListener("submit", submitLead);

        // المتابعات
        $("#addFollowupBtn").addEventListener("click", () => openFollowupModal(null));
        $("#followupForm").addEventListener("submit", submitFollowup);

        // المهام
        $("#addTaskBtn").addEventListener("click", () => openTaskModal(null));
        $("#taskForm").addEventListener("submit", submitTask);
        $("#taskSearchInput").addEventListener("input", () => renderTasks());
        $("#taskStatusFilter").addEventListener("change", (e) => {
            state.taskStatus = e.target.value;
            renderTasks();
        });

        // الفلاتر
        $("#searchInput").addEventListener("input", (e) => {
            state.filters.search = e.target.value;
            renderCustomers();
        });
        $("#statusFilter").addEventListener("change", (e) => {
            state.filters.status = e.target.value;
            renderCustomers();
        });
        $("#sourceFilter").addEventListener("change", (e) => {
            state.filters.source = e.target.value;
            renderCustomers();
        });
        $("#employeeFilter").addEventListener("change", (e) => {
            state.filters.employee = e.target.value;
            renderCustomers();
        });
        $("#clearFiltersBtn").addEventListener("click", () => {
            state.filters = { status: "all", source: "all", employee: "all", search: "" };
            $("#searchInput").value = "";
            renderAll();
        });

        // الإعدادات
        $("#saveSettingsBtn").addEventListener("click", saveSettings);

        // تصدير / استيراد
        $("#exportBtn").addEventListener("click", exportData);
        $("#settingsExportBtn").addEventListener("click", exportData);
        $("#importFile").addEventListener("change", (e) => {
            if (e.target.files[0]) importData(e.target.files[0]);
            e.target.value = "";
        });
        $("#resetDataBtn").addEventListener("click", factoryReset);
        $("#factoryResetBtn").addEventListener("click", factoryReset);

        // طباعة
        $("#printReportBtn").addEventListener("click", printReport);

        // إغلاق النوافذ
        $$("[data-close]").forEach(el =>
            el.addEventListener("click", () => closeModal(el.dataset.close)));
        $$(".modal").forEach(m =>
            m.addEventListener("click", (e) => {
                if (e.target === m) m.hidden = true;
            }));
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") $$(".modal").forEach(m => m.hidden = true);
        });
    }

    /* ---------- الواجهة العامة ---------- */
    window.CRM = {
        openDetail,
        editLead,
        deleteLead,
        completeFollowup,
        editFollowup,
        deleteFollowup,
        toggleTask,
        editTask,
        deleteTask
    };

    /* ---------- تشغيل ---------- */
    load();
    seedData();
    bindEvents();

    // إعدادات عنوان
    $("#brandTitle").textContent = state.settings.companyName;
    document.title = state.settings.companyName + " - لوحة التحكم";

    renderAll();
})();
