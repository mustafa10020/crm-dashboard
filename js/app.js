/* ============================================================
   Nexus CRM — منطق التطبيق
   SPA بسيطة بدون أي مكتبة واجهة (Vanilla JS) لتعمل مباشرة من
   GitHub Pages بدون خطوة بناء (build step).
   ============================================================ */

DataStore.init();

let CURRENT_USER = null;      // بيانات الموظف بعد تسجيل الدخول
let CURRENT_VIEW = 'dashboard';
let SELECTED_CUSTOMER_ID = null;
let CHARTS = {};              // مرجع لكل الرسوم البيانية عشان نعمل destroy قبل إعادة الرسم

/* ---------------- أدوات مساعدة عامة ---------------- */
function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function openModal(id) { $('#' + id).classList.add('open'); }
function closeModal(id) { $('#' + id).classList.remove('open'); }
$all('.close').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
$all('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));

function isAdmin() { return CURRENT_USER && CURRENT_USER.role === 'admin'; }

/* عملاء يراها المستخدم الحالي: الإدمن يرى الكل، الموظف يرى عملاءه فقط */
function visibleCustomers() {
  const all = DataStore.getCustomers();
  if (isAdmin()) return all;
  return all.filter(c => c.assignedTo === CURRENT_USER.id);
}

/* ============================================================
   تسجيل الدخول / الخروج
   ============================================================ */
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  doLogin($('#loginUser').value.trim(), $('#loginPass').value);
});

function doLogin(user, pass) {
  const emp = DataStore.getEmployees().find(x => x.username === user && x.password === pass);
  if (!emp) {
    $('#loginError').textContent = 'بيانات الدخول غير صحيحة';
    return;
  }
  DataStore.setSession({ employeeId: emp.id });
  enterApp(emp);
}

$all('[data-quick]').forEach(btn => {
  btn.addEventListener('click', () => {
    const u = btn.dataset.quick;
    doLogin(u, u === 'admin' ? 'admin123' : '123456');
  });
});

$('#logoutBtn').addEventListener('click', () => {
  DataStore.clearSession();
  location.reload();
});

/* ============================================================
   التنقّل بين الصفحات (Router بسيط)
   ============================================================ */
const VIEW_TITLES = {
  dashboard: ['الرئيسية', 'نظرة عامة على أداء اليوم'],
  leads: ['العملاء', 'إدارة وتصنيف كل العملاء'],
  customer: ['ملف العميل', 'بيانات كاملة ومتابعات وسجل محادثة'],
  properties: ['العقارات', 'التسويق العقاري — إدارة العقارات وربطها بالعملاء'],
  admin: ['لوحة الإدمن', 'إدارة الموظفين والأداء والربط التلقائي']
};

function goTo(view) {
  CURRENT_VIEW = view;
  $all('.view').forEach(v => v.classList.add('hidden'));
  $('#view-' + view).classList.remove('hidden');
  $all('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const [title, subtitle] = VIEW_TITLES[view];
  $('#pageTitle').textContent = title;
  $('#pageSubtitle').textContent = subtitle;

  if (view === 'dashboard') renderDashboard();
  if (view === 'leads') renderLeadsPage();
  if (view === 'properties') renderPropertiesPage();
  if (view === 'admin') renderAdminPage();
}

$all('.nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => goTo(btn.dataset.view));
});

/* ============================================================
   بدء التشغيل
   - عند فتح الصفحة تُستعاد جلسة المدير فقط تلقائياً.
   - جلسة أي موظف عادي تُمسح عند الفتح، فتظهر شاشة الدخول
     بزر "دخول كمدير النظام" — حتى لا يفتح النظام أبداً
     على حساب موظف دون تسجيل دخول صريح.
   ============================================================ */
function boot() {
  const session = DataStore.getSession();
  const emp = session && session.employeeId
    ? DataStore.getEmployees().find(x => x.id === session.employeeId)
    : null;
  if (!emp || emp.role !== 'admin') {
    if (emp) DataStore.clearSession(); // لا نستعيد جلسة موظف عادي
    $('#loginUser').value = 'admin';
    $('#loginPass').value = '';
    $('#loginUser').focus();
    return; // تبقى شاشة الدخول ظاهرة
  }
  enterApp(emp);
}

function enterApp(emp) {
  CURRENT_USER = emp;
  $('#loginScreen').classList.add('hidden');
  $('#appShell').classList.remove('hidden');

  $('#userNameLabel').textContent = emp.name;
  $('#userRoleLabel').textContent = emp.role === 'admin' ? 'مدير النظام' : 'موظف مبيعات';
  $('#userAvatar').textContent = emp.name.trim()[0] || '?';
  $('#userAvatar').style.background = emp.color || 'var(--accent)';

  $all('[data-admin-only]').forEach(el => el.style.display = isAdmin() ? '' : 'none');

  populateStatusSelects();
  populateEmployeeSelects();
  goTo('dashboard');
}

/* ============================================================
   لوحة القيادة Dashboard
   ============================================================ */
const KPI_DEFS = [
  { key: 'total', label: 'إجمالي العملاء', color: 'blue' },
  { key: 'newLeads', label: 'عملاء جدد', color: 'cyan' },
  { key: 'startAction', label: 'قيد الإجراء', color: 'orange' },
  { key: 'onGoing', label: 'قيد التنفيذ', color: 'purple' },
  { key: 'done', label: 'صفقات منجزة', color: 'green' },
  { key: 'closed', label: 'عملاء مغلقين', color: 'lime' },
  { key: 'delay', label: 'متأخر', color: 'red' },
  { key: 'notComm', label: 'غير متواصل', color: 'gray' },
  { key: 'followUps', label: 'متابعات قادمة', color: 'yellow' },
  { key: 'meetings', label: 'اجتماعات قادمة', color: 'teal' },
  { key: 'dailyActivities', label: 'أنشطة اليوم', color: 'pink' },
  { key: 'todayMsgs', label: 'رسائل اليوم', color: 'dark' }
];

function computeKPIs() {
  const list = visibleCustomers();
  const today = todayISO();
  const k = {
    total: list.length,
    newLeads: list.filter(c => c.status === STATUS.NEW).length,
    startAction: list.filter(c => c.status === STATUS.START_ACTION).length,
    onGoing: list.filter(c => c.status === STATUS.ON_GOING).length,
    done: list.filter(c => c.status === STATUS.DONE).length,
    closed: list.filter(c => c.status === STATUS.CLOSED).length,
    delay: list.filter(c => c.status === STATUS.DELAY).length,
    notComm: list.filter(c => c.status === STATUS.NOT_COMM).length,
    followUps: 0, meetings: 0, dailyActivities: 0, todayMsgs: 0
  };
  list.forEach(c => {
    (c.activities || []).forEach(a => {
      if (a.type === 'followup') k.followUps++;
      if (a.type === 'meeting') k.meetings++;
      if (a.date === today) k.dailyActivities++;
    });
    (c.conversation || []).forEach(m => {
      if ((m.time || '').startsWith(today)) k.todayMsgs++;
    });
  });
  return k;
}

function renderDashboard() {
  const kpis = computeKPIs();
  $('#kpiGrid').innerHTML = KPI_DEFS.map(def => `
    <div class="kpi-card ${def.color}">
      <span class="kpi-label">${def.label}</span>
      <span class="kpi-value">${kpis[def.key]}</span>
    </div>
  `).join('');

  renderActivitiesPanel('followup');
  renderPulse();
  renderStatusChart();
  renderEmployeeChart();
  renderLiveLog();
  renderMyDayBar();
  renderSchedule();
}

/* شريط يوم الموظف — عملائي + متابعات اليوم + المتأخرة */
function renderMyDayBar() {
  const me = CURRENT_USER || {};
  const list = visibleCustomers();
  const today = todayISO();
  const weekEnd = daysFromNow(7);
  let todayCount = 0, overdueCount = 0, weekCount = 0;
  list.forEach(c => (c.activities || []).forEach(a => {
    if (a.type !== 'followup' && a.type !== 'meeting') return;
    if (a.date === today) todayCount++;
    else if (a.date < today) overdueCount++;
    else if (a.date <= weekEnd) weekCount++;
  }));
  $('#myDayBar').innerHTML = `
    <div class="my-day-item head">${me.name}</div>
    <div class="my-day-item"><b>${list.length}</b> عميل مسند إليك</div>
    <div class="my-day-item today"><b>${todayCount}</b> متابعة اليوم</div>
    <div class="my-day-item warn"><b>${overdueCount}</b> متأخرة — لا تضيّع الموعد</div>
    <div class="my-day-item"><b>${weekCount}</b> خلال 7 أيام</div>`;
}

/* جدول متابعات كل موظف تلقائياً بالتاريخ والساعة */
function renderSchedule() {
  const isAdminUser = isAdmin();
  const employees = DataStore.getEmployees();
  const empName = id => { const e = employees.find(x => x.id === id); return e ? e.name : '—'; };
  const today = todayISO();
  const weekEnd = daysFromNow(7);
  const items = [];
  visibleCustomers().forEach(c => (c.activities || []).forEach(a => {
    if (a.type !== 'followup' && a.type !== 'meeting') return;
    items.push({ ...a, customerId: c.id, customerName: c.name, empName: empName(c.assignedTo) });
  }));
  items.sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));

  const section = (list, cls, label) => {
    if (!list.length) return '';
    return `<div class="schedule-group">
      <div class="schedule-group-title ${cls}">${label} (${list.length})</div>
      ${list.map(i => `
        <div class="schedule-row ${cls}" data-open-cust="${i.customerId}">
          <span class="sched-type">${i.type === 'meeting' ? '🤝' : '🔔'}</span>
          <div class="sched-main">
            <b>${i.customerName}</b>
            <span>${i.text}</span>
          </div>
          <span class="sched-date" dir="ltr">${i.date}${i.time ? ' ' + i.time : ''}</span>
          ${isAdminUser ? `<span class="sched-emp">${i.empName}</span>` : ''}
        </div>`).join('')}
    </div>`;
  };

  const html =
    section(items.filter(i => i.date < today), 'overdue', '⚠️ متأخرة — راجعها فوراً') +
    section(items.filter(i => i.date === today), 'today', '📅 اليوم') +
    section(items.filter(i => i.date > today && i.date <= weekEnd), 'up', '🗓️ خلال 7 أيام') +
    section(items.filter(i => i.date > weekEnd), 'later', '📆 لاحقاً');

  $('#scheduleContent').innerHTML = html || '<p class="empty-state">لا توجد متابعات مجدولة في نطاقك الآن. أضف متابعة من ملف العميل وستظهر هنا تلقائياً.</p>';

  $all('[data-open-cust]', $('#scheduleContent')).forEach(row => {
    row.addEventListener('click', () => openCustomer(row.dataset.openCust));
  });
}

/* سجل الخطوات لحظة بلحظة — كل إجراء يسجله الفريق يظهر هنا فوراً */
function renderLiveLog() {
  const log = DataStore.getActivityLog();
  const el = $('#liveLog');
  if (!log.length) {
    el.innerHTML = '<p class="empty-state">لم تُسجَّل خطوات بعد. أي إضافة عميل، نشاط، توزيع، أو تغيير حالة سيظهر هنا لحظياً.</p>';
    return;
  }
  el.innerHTML = log.slice(0, 30).map(l => `
    <div class="log-row">
      <span class="log-time">${l.time ? l.time.slice(11, 16) : ''}</span>
      <span class="log-badge">${l.action}</span>
      <span class="log-text">${l.text}</span>
    </div>`).join('');
}

/* الأنشطة القادمة خلال 7 أيام، مقسّمة بتابات */
function renderActivitiesPanel(type) {
  $all('#activityTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === type));
  const list = visibleCustomers();
  const from = todayISO();
  const to = daysFromNow(7);
  const rows = [];
  list.forEach(c => {
    (c.activities || []).forEach(a => {
      if (a.type === type && a.date >= from && a.date <= to) {
        rows.push({ ...a, customerName: c.name, customerId: c.id });
      }
    });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const el = $('#activityContent');
  if (!rows.length) {
    el.innerHTML = '<p class="empty-state">لا توجد أنشطة لهذا اليوم</p>';
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="activity-row" data-open-customer="${r.customerId}">
      <div>
        <span class="a-name">${r.customerName}</span>
        <div>${r.text}</div>
      </div>
      <span>${r.date}${r.time ? ' ' + r.time : ''}</span>
    </div>
  `).join('');
  $all('[data-open-customer]', el).forEach(row => {
    row.addEventListener('click', () => openCustomer(row.dataset.openCustomer));
  });
}

$all('#activityTabs .tab').forEach(t => t.addEventListener('click', () => renderActivitiesPanel(t.dataset.tab)));

/* حلقة "نبض الفريق" — نسبة أنشطة اليوم المُنجزة */
function renderPulse() {
  const list = visibleCustomers();
  const today = todayISO();
  let all = [], doneCount = 0;
  list.forEach(c => (c.activities || []).forEach(a => {
    if (a.date === today) { all.push(a); if (a.done) doneCount++; }
  }));
  const pct = all.length ? Math.round((doneCount / all.length) * 100) : 0;
  const circumference = 364;
  const offset = circumference - (circumference * pct) / 100;
  $('#pulseCircle').style.strokeDashoffset = all.length ? offset : circumference;
  $('#pulsePercent').textContent = pct + '%';
  $('#pulseNote').textContent = all.length
    ? `${doneCount} من ${all.length} نشاط مُنجز اليوم`
    : 'لا توجد أنشطة لهذا اليوم';
}

function destroyChart(key) { if (CHARTS[key]) { CHARTS[key].destroy(); delete CHARTS[key]; } }

function renderStatusChart() {
  const list = visibleCustomers();
  const labels = Object.values(STATUS);
  const data = labels.map(s => list.filter(c => c.status === s).length);
  const colors = labels.map(s => getComputedStyle(document.documentElement).getPropertyValue('--c-' + STATUS_COLORS[s]).trim());
  destroyChart('status');
  CHARTS.status = new Chart($('#statusChart'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal', size: 11 } } } }, cutout: '62%' }
  });
}

function renderEmployeeChart() {
  const employees = DataStore.getEmployees().filter(e => e.role === 'employee');
  const customers = DataStore.getCustomers();
  const labels = employees.map(e => e.name);
  const data = employees.map(e => customers.filter(c => c.assignedTo === e.id).length);
  destroyChart('employee');
  CHARTS.employee = new Chart($('#employeeChart'), {
    type: 'bar',
    data: { labels, datasets: [{ label: 'عدد العملاء', data, backgroundColor: '#4F46E5', borderRadius: 8, maxBarThickness: 46 }] },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { ticks: { font: { family: 'Tajawal' } } } }
    }
  });
}

/* ============================================================
   صفحة العملاء (Leads)
   ============================================================ */
function populateStatusSelects() {
  const opts = Object.values(STATUS).map(s => `<option value="${s}">${s}</option>`).join('');
  $('#leadStatus').innerHTML = opts;
  $('#filterStatus').innerHTML = '<option value="">كل الحالات</option>' + opts;
}

function populateEmployeeSelects() {
  const emps = DataStore.getEmployees();
  const opts = emps.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
  $('#leadAssigned').innerHTML = '<option value="">⚖️ تلقائي (توزيع عادل)</option>' + opts;
  $('#filterEmployee').innerHTML = '<option value="">كل الموظفين</option>' + opts;
  $('#filterEmployee').closest('.filters').style.display = isAdmin() ? '' : 'none';
}

function populatePropertySelects() {
  const props = DataStore.getProperties();
  $('#leadProperty').innerHTML = '<option value="">— بدون عقار —</option>' +
    props.map(p => `<option value="${p.id}">${p.title} (${p.price ? (+p.price).toLocaleString('ar-EG') + ' ج.م' : ''})</option>`).join('');
}

function renderLeadsPage() {
  populateEmployeeSelects();
  drawLeadsTable();
}

function drawLeadsTable() {
  const search = $('#leadsSearch').value.trim().toLowerCase();
  const statusFilter = $('#filterStatus').value;
  const empFilter = $('#filterEmployee').value;
  const employees = DataStore.getEmployees();

  let list = visibleCustomers();
  if (search) list = list.filter(c => c.name.toLowerCase().includes(search) || (c.phone || '').includes(search));
  if (statusFilter) list = list.filter(c => c.status === statusFilter);
  if (empFilter) list = list.filter(c => c.assignedTo === empFilter);

  const body = $('#leadsTableBody');
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">لا يوجد عملاء مطابقين</td></tr>`;
    return;
  }
  body.innerHTML = list.map(c => {
    const emp = employees.find(e => e.id === c.assignedTo);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--c-' + STATUS_COLORS[c.status]).trim();
    return `
    <tr data-row="${c.id}">
      <td><strong>${c.name}</strong></td>
      <td>${c.phone || '—'}</td>
      <td>${c.source || '—'}</td>
      <td><span class="status-pill" style="background:${color}">${c.status}</span></td>
      <td>${emp ? emp.name : '—'}</td>
      <td>${(c.value || 0).toLocaleString('ar-EG')} ج.م</td>
      <td>${c.createdAt}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit="${c.id}">تعديل</button>
          <button class="icon-btn danger" data-del="${c.id}">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  $all('tr[data-row]', body).forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('[data-edit],[data-del]')) return;
      openCustomer(row.dataset.row);
    });
  });
  $all('[data-edit]', body).forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openLeadModal(b.dataset.edit); }));
  $all('[data-del]', body).forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (confirm('هل تريد حذف هذا العميل نهائيًا؟')) {
      const removed = DataStore.getCustomers().find(c => c.id === b.dataset.del);
      DataStore.saveCustomers(DataStore.getCustomers().filter(c => c.id !== b.dataset.del));
      DataStore.logActivity('حذف عميل', `تم حذف "${removed ? removed.name : ''}"`);
      showToast('تم حذف العميل');
      drawLeadsTable();
    }
  }));
}

['leadsSearch', 'filterStatus', 'filterEmployee'].forEach(id => {
  $('#' + id).addEventListener('input', drawLeadsTable);
  $('#' + id).addEventListener('change', drawLeadsTable);
});

$('#addLeadBtn').addEventListener('click', () => openLeadModal(null));

function openLeadModal(customerId) {
  const isEdit = !!customerId;
  $('#leadModalTitle').textContent = isEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد';
  populateStatusSelects();
  populateEmployeeSelects();
  populatePropertySelects();

  if (isEdit) {
    const c = DataStore.getCustomers().find(x => x.id === customerId);
    $('#leadId').value = c.id;
    $('#leadName').value = c.name;
    $('#leadPhone').value = c.phone || '';
    $('#leadSource').value = c.source || '';
    $('#leadStatus').value = c.status;
    $('#leadAssigned').value = c.assignedTo || '';
    $('#leadProperty').value = c.propertyId || '';
    $('#leadValue').value = c.value || 0;
  } else {
    $('#leadForm').reset();
    $('#leadId').value = '';
    $('#leadAssigned').value = isAdmin() ? '' : CURRENT_USER.id;
  }
  openModal('leadModal');
}

$('#leadForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#leadId').value;
  const all = DataStore.getCustomers();
  const payload = {
    name: $('#leadName').value.trim(),
    phone: $('#leadPhone').value.trim(),
    source: $('#leadSource').value.trim(),
    status: $('#leadStatus').value,
    assignedTo: $('#leadAssigned').value,
    propertyId: $('#leadProperty').value,
    value: Number($('#leadValue').value) || 0
  };
  if (id) {
    const idx = all.findIndex(c => c.id === id);
    all[idx] = { ...all[idx], ...payload };
    DataStore.logActivity('تعديل عميل', `تم تحديث بيانات "${payload.name}"`);
    showToast('تم تحديث بيانات العميل');
  } else {
    const customer = { id: uid('cus'), ...payload, createdAt: todayISO(), notes: [], activities: [], conversation: [] };
    // إذا لم يُحدَّد موظف → توزيع عادل تلقائي
    const assignedEmp = customer.assignedTo ? null : DataStore.autoAssignCustomer(customer);
    all.push(customer);
    DataStore.logActivity('إضافة عميل', `تمت إضافة "${customer.name}"${assignedEmp ? ' وإسناده تلقائياً إلى ' + assignedEmp.name : ''} (المصدر: ${customer.source || 'غير محدد'})`);
    // إرسال للربط الخارجي إن كان مفعلاً
    DataStore.submitToWebhooks(customer);
    showToast('تم إضافة العميل بنجاح' + (assignedEmp ? ' — أسند إلى ' + assignedEmp.name : ''));
  }
  DataStore.saveCustomers(all);
  closeModal('leadModal');
  drawLeadsTable();
  if (CURRENT_VIEW === 'dashboard') renderDashboard();
});

/* ============================================================
   صفحة العقارات (التسويق العقاري)
   ============================================================ */
function renderPropertiesPage() {
  drawPropertiesTable();
}

function drawPropertiesTable() {
  const search = $('#propertySearch').value.trim().toLowerCase();
  const statusFilter = $('#filterPropertyStatus').value;
  const customers = DataStore.getCustomers();

  let list = DataStore.getProperties();
  if (search) list = list.filter(p => (p.title + ' ' + p.location).toLowerCase().includes(search));
  if (statusFilter) list = list.filter(p => p.status === statusFilter);

  const body = $('#propertiesTableBody');
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="8" class="empty-state">لا توجد عقارات. أضف أول عقار لبدء تنظيم التسويق العقاري</td></tr>`;
    return;
  }
  body.innerHTML = list.map(p => {
    const interested = customers.filter(c => c.propertyId === p.id).length;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--c-' + (PROPERTY_STATUS_COLORS[p.status] || 'blue')).trim();
    return `
    <tr data-prop="${p.id}">
      <td><strong>${p.title}</strong></td>
      <td>${p.location || '—'}</td>
      <td>${p.area || '—'}</td>
      <td>${(p.price || 0).toLocaleString('ar-EG')} ج.م</td>
      <td><span class="status-pill" style="background:${color}">${p.status}</span></td>
      <td>${interested}</td>
      <td>${p.source || '—'}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn" data-edit-prop="${p.id}">تعديل</button>
          <button class="icon-btn danger" data-del-prop="${p.id}">حذف</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  $all('[data-edit-prop]', body).forEach(b => b.addEventListener('click', () => openPropertyModal(b.dataset.editProp)));
  $all('[data-del-prop]', body).forEach(b => b.addEventListener('click', () => {
    if (!confirm('حذف هذا العقار؟')) return;
    DataStore.saveProperties(DataStore.getProperties().filter(p => p.id !== b.dataset.delProp));
    DataStore.logActivity('حذف عقار', 'تم حذف عقار من القائمة');
    showToast('تم حذف العقار');
    drawPropertiesTable();
  }));
}

['propertySearch', 'filterPropertyStatus'].forEach(id => {
  $('#' + id).addEventListener('input', drawPropertiesTable);
  $('#' + id).addEventListener('change', drawPropertiesTable);
});

$('#addPropertyBtn').addEventListener('click', () => openPropertyModal(null));

function openPropertyModal(propertyId) {
  $('#propertyModalTitle').textContent = propertyId ? 'تعديل العقار' : 'إضافة عقار جديد';
  if (propertyId) {
    const p = DataStore.getProperties().find(x => x.id === propertyId);
    $('#propertyId').value = p.id;
    $('#propTitle').value = p.title;
    $('#propLocation').value = p.location || '';
    $('#propArea').value = p.area || '';
    $('#propPrice').value = p.price || 0;
    $('#propStatus').value = p.status;
    $('#propSource').value = p.source || 'موقع';
  } else {
    $('#propertyForm').reset();
    $('#propertyId').value = '';
  }
  openModal('propertyModal');
}

$('#propertyForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('#propertyId').value;
  const all = DataStore.getProperties();
  const payload = {
    title: $('#propTitle').value.trim(),
    location: $('#propLocation').value.trim(),
    area: $('#propArea').value.trim(),
    price: Number($('#propPrice').value) || 0,
    status: $('#propStatus').value,
    source: $('#propSource').value
  };
  if (id) {
    const idx = all.findIndex(p => p.id === id);
    all[idx] = { ...all[idx], ...payload };
    DataStore.logActivity('تعديل عقار', `تم تحديث بيانات "${payload.title}"`);
    showToast('تم تحديث العقار');
  } else {
    all.push({ id: uid('prop'), ...payload, createdAt: todayISO() });
    DataStore.logActivity('إضافة عقار', `تمت إضافة عقار "${payload.title}" (${payload.location}) بسعر ${(+payload.price).toLocaleString('ar-EG')} ج.م`);
    showToast('تم إضافة العقار');
  }
  DataStore.saveProperties(all);
  closeModal('propertyModal');
  drawPropertiesTable();
});

/* ============================================================
   صفحة تفاصيل العميل
   ============================================================ */
function openCustomer(id) {
  SELECTED_CUSTOMER_ID = id;
  goTo('customer');
  renderCustomerPage();
}

$('#backToLeads').addEventListener('click', () => goTo('leads'));

function getSelectedCustomer() {
  return DataStore.getCustomers().find(c => c.id === SELECTED_CUSTOMER_ID);
}

function renderCustomerPage() {
  const c = getSelectedCustomer();
  if (!c) { goTo('leads'); return; }
  const emp = DataStore.getEmployees().find(e => e.id === c.assignedTo);
  const color = getComputedStyle(document.documentElement).getPropertyValue('--c-' + STATUS_COLORS[c.status]).trim();

  $('#custName').textContent = c.name;
  const prop = DataStore.getProperties().find(p => p.id === c.propertyId);
  $('#custMeta').textContent = `${c.phone || 'بدون هاتف'} · المصدر: ${c.source || '—'} · المسؤول: ${emp ? emp.name : '—'}${prop ? ' · العقار: ' + prop.title : ''}`;
  $('#custStatusPill').textContent = c.status;
  $('#custStatusPill').style.background = color;

  $('#ctab-info').innerHTML = `
    <div class="info-grid">
      <div class="info-item"><span>اسم العميل</span><strong>${c.name}</strong></div>
      <div class="info-item"><span>رقم الهاتف / واتساب</span><strong>${c.phone || '—'}</strong></div>
      <div class="info-item"><span>المصدر</span><strong>${c.source || '—'}</strong></div>
      <div class="info-item"><span>الحالة الحالية</span><strong>${c.status}</strong></div>
      <div class="info-item"><span>الموظف المسؤول</span><strong>${emp ? emp.name : '—'}</strong></div>
      <div class="info-item"><span>العقار المهتم به</span><strong>${prop ? prop.title : '—'}</strong></div>
      <div class="info-item"><span>القيمة المتوقعة</span><strong>${(c.value || 0).toLocaleString('ar-EG')} ج.م</strong></div>
      <div class="info-item"><span>تاريخ الإضافة</span><strong>${c.createdAt}</strong></div>
    </div>
    <div class="info-actions">
      <button class="btn-secondary" id="editFromProfile">تعديل بيانات العميل</button>
      <button class="btn-secondary" id="waQuickLink">📲 فتح محادثة واتساب</button>
    </div>
  `;
  $('#editFromProfile').addEventListener('click', () => openLeadModal(c.id));
  $('#waQuickLink').addEventListener('click', () => {
    if (!c.phone) { showToast('لا يوجد رقم هاتف لهذا العميل'); return; }
    const num = c.phone.replace(/\D/g, '');
    window.open('https://wa.me/' + num, '_blank');
  });

  renderTimeline(c);
  renderWhatsapp(c);

  $all('.customer-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.ctab === 'info'));
  $all('.ctab-panel').forEach(p => p.classList.add('hidden'));
  $('#ctab-info').classList.remove('hidden');
}

$all('.customer-tabs .tab').forEach(t => t.addEventListener('click', () => {
  $all('.customer-tabs .tab').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  $all('.ctab-panel').forEach(p => p.classList.add('hidden'));
  $('#ctab-' + t.dataset.ctab).classList.remove('hidden');
}));

function renderTimeline(c) {
  const list = (c.activities || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  const typeLabel = { followup: 'متابعة', delay: 'متأخر', meeting: 'اجتماع', call: 'مكالمة' };
  $('#timelineList').innerHTML = list.length
    ? list.map(a => `
      <div class="timeline-item type-${a.type}">
        <span class="t-date">${a.date}${a.time ? '<br>' + a.time : ''}</span>
        <div>
          <strong>${typeLabel[a.type] || a.type}</strong>
          <div>${a.text}</div>
        </div>
      </div>`).join('')
    : '<p class="empty-state">لا يوجد أنشطة مسجلة لهذا العميل بعد</p>';
}

$('#addActivityBtn').addEventListener('click', () => {
  $('#activityForm').reset();
  $('#actDate').value = todayISO();
  $('#actTime').value = new Date().toTimeString().slice(0, 5);
  openModal('activityModal');
});

$('#activityForm').addEventListener('submit', e => {
  e.preventDefault();
  const all = DataStore.getCustomers();
  const idx = all.findIndex(c => c.id === SELECTED_CUSTOMER_ID);
  const text = $('#actText').value.trim();
  all[idx].activities = all[idx].activities || [];
  const act = {
    id: uid('act'), text, type: $('#actType').value,
    date: $('#actDate').value, time: $('#actTime').value || '', done: false
  };
  all[idx].activities.push(act);
  DataStore.saveCustomers(all);
  DataStore.logActivity('نشاط جديد', `"${all[idx].name}": ${text} (${act.date}${act.time ? ' ' + act.time : ''})`);
  closeModal('activityModal');
  renderTimeline(all[idx]);
  renderSchedule();
  renderMyDayBar();
  showToast('تم إضافة النشاط إلى جدول المتابعات');
});

/* -------- سجل محادثة واتساب (يدوي، مرتبط بملف العميل) -------- */
function renderWhatsapp(c) {
  const list = c.conversation || [];
  $('#waThread').innerHTML = list.length
    ? list.map(m => `
      <div class="wa-bubble ${m.direction}">
        ${m.text}
        <span class="wa-time">${m.time}</span>
      </div>`).join('')
    : '<p class="empty-state">لا توجد رسائل مسجلة بعد</p>';
  $('#waThread').scrollTop = $('#waThread').scrollHeight;
}

$('#waForm').addEventListener('submit', e => {
  e.preventDefault();
  const all = DataStore.getCustomers();
  const idx = all.findIndex(c => c.id === SELECTED_CUSTOMER_ID);
  all[idx].conversation = all[idx].conversation || [];
  const now = new Date();
  const time = `${todayISO()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  all[idx].conversation.push({ id: uid('msg'), direction: $('#waDirection').value, text: $('#waMessage').value.trim(), time });
  DataStore.saveCustomers(all);
  DataStore.logActivity('رسالة واتساب', `"${all[idx].name}": ${$('#waDirection').value === 'out' ? 'مُرسلة' : 'واردة'} — ${$('#waMessage').value.trim()}`);
  $('#waMessage').value = '';
  renderWhatsapp(all[idx]);
});

/* ============================================================
   لوحة الإدمن
   ============================================================ */
function renderAdminPage() {
  if (!isAdmin()) { goTo('dashboard'); return; }
  const employees = DataStore.getEmployees();
  const customers = DataStore.getCustomers();
  loadIntegrationSettings();

  $('#employeesTableBody').innerHTML = employees.map(e => {
    const count = customers.filter(c => c.assignedTo === e.id).length;
    return `
    <tr>
      <td><strong>${e.name}</strong></td>
      <td>${e.username}</td>
      <td>${e.role === 'admin' ? 'مدير' : 'موظف'}</td>
      <td>${count}</td>
      <td>${e.id === CURRENT_USER.id ? '' : `<button class="icon-btn danger" data-del-emp="${e.id}">حذف</button>`}</td>
    </tr>`;
  }).join('');

  $all('[data-del-emp]').forEach(b => b.addEventListener('click', () => {
    if (!confirm('حذف هذا الموظف؟ سيبقى عملاؤه بدون موظف مسؤول.')) return;
    const list = DataStore.getEmployees().filter(e => e.id !== b.dataset.delEmp);
    DataStore.saveEmployees(list);
    showToast('تم حذف الموظف');
    renderAdminPage();
  }));

  destroyChart('adminPerf');
  const empOnly = employees.filter(e => e.role === 'employee');
  const closedCounts = empOnly.map(e => customers.filter(c => c.assignedTo === e.id && c.status === STATUS.DONE).length);
  const totalCounts = empOnly.map(e => customers.filter(c => c.assignedTo === e.id).length);
  CHARTS.adminPerf = new Chart($('#adminPerfChart'), {
    type: 'bar',
    data: {
      labels: empOnly.map(e => e.name),
      datasets: [
        { label: 'إجمالي العملاء', data: totalCounts, backgroundColor: '#C7D2FE', borderRadius: 8 },
        { label: 'صفقات منجزة', data: closedCounts, backgroundColor: '#16A34A', borderRadius: 8 }
      ]
    },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } }
  });
}

$('#addEmployeeBtn').addEventListener('click', () => { $('#employeeForm').reset(); openModal('employeeModal'); });

$('#employeeForm').addEventListener('submit', e => {
  e.preventDefault();
  const list = DataStore.getEmployees();
  const newEmp = {
    id: uid('emp'), name: $('#empName').value.trim(), username: $('#empUser').value.trim(),
    password: $('#empPass').value, role: $('#empRole').value,
    color: ['#4F46E5', '#0EA5A5', '#D97706', '#DB2777', '#16A34A', '#7C3AED'][list.length % 6]
  };
  list.push(newEmp);
  DataStore.saveEmployees(list);
  DataStore.logActivity('إضافة موظف', `تمت إضافة الموظف "${newEmp.name}"`);
  closeModal('employeeModal');
  showToast('تم إضافة الموظف');
  renderAdminPage();
});

/* ---------- التوزيع العادل ---------- */
$('#distributeBtn').addEventListener('click', () => {
  if (!isAdmin()) return;
  if (!confirm('إعادة توزيع كل العملاء الغير مسندين لأي موظف (توزيع عادل)؟')) return;
  const n = DataStore.distributeUnassigned();
  showToast(n ? `تم إسناد ${n} عميل تلقائياً` : 'لا يوجد عملاء غير مسندين');
  renderAdminPage();
  if (CURRENT_VIEW === 'dashboard') renderDashboard();
});

/* ---------- إعدادات الربط (Integration) ---------- */
function loadIntegrationSettings() {
  const cfg = DataStore.getIntegration();
  $('#cfgDistMode').value = cfg.distributionMode;
  $('#cfgWaEnabled').checked = !!cfg.whatsappEnabled;
  $('#cfgWaNumber').value = cfg.whatsappNumber || '';
  $('#cfgWaToken').value = cfg.whatsappToken || '';
  $('#cfgWaWebhook').value = cfg.whatsappWebhook || '';
  $('#cfgSheetsWebhook').value = cfg.sheetsWebhook || '';
  $('#cfgSupabaseUrl').value = cfg.supabaseUrl || '';
  $('#cfgSupabaseKey').value = cfg.supabaseKey || '';
  $('#cfgMessengerEnabled').checked = !!cfg.messengerEnabled;
  $('#cfgMessengerToken').value = cfg.messengerPageToken || '';
}

$('#saveIntegrationBtn').addEventListener('click', () => {
  const cfg = DataStore.getIntegration();
  cfg.distributionMode = $('#cfgDistMode').value;
  cfg.whatsappEnabled = $('#cfgWaEnabled').checked;
  cfg.whatsappNumber = $('#cfgWaNumber').value.trim();
  cfg.whatsappToken = $('#cfgWaToken').value.trim();
  cfg.whatsappWebhook = $('#cfgWaWebhook').value.trim();
  cfg.sheetsWebhook = $('#cfgSheetsWebhook').value.trim();
  cfg.supabaseUrl = $('#cfgSupabaseUrl').value.trim();
  cfg.supabaseKey = $('#cfgSupabaseKey').value.trim();
  cfg.messengerEnabled = $('#cfgMessengerEnabled').checked;
  cfg.messengerPageToken = $('#cfgMessengerToken').value.trim();
  DataStore.saveIntegration(cfg);
  DataStore.logActivity('إعدادات الربط', `تم حفظ إعدادات الربط — وضع التوزيع: ${cfg.distributionMode === 'performance' ? 'الكفاءة' : 'العدالة'}`);
  showToast('تم حفظ إعدادات الربط');
});

/* ---------- تحديث سجل اللحظة ---------- */
$('#refreshLogBtn').addEventListener('click', () => {
  renderLiveLog();
  showToast('تم تحديث السجل اللحظي');
});

/* ---------- محاكاة رسالة عميل واردة (اختبار المسار كاملاً) ----------
   تُستخدم قبل تفعيل واتساب الأعمال لإظهار نفس النتيجة تماماً:
   استقبال رسالة → إنشاء عميل → توزيع عادل → ظهور الرسالة في الموقع
   → تسجيل في سجل اللحظة. بعد تفعيل Webhook الحقيقي، نفس المسار
   سيستقبل رسائل العملاء الفعلية.
*/
const FAKE_CLIENTS = ['كريم عادل', 'نورا سمير', 'طارق حسين', 'آية محمود', 'إبراهيم فؤاد', 'دينا مصطفى'];
const FAKE_MESSAGES = [
  'أنا مهتم بشقة 220 متر في بيت الوطن، ممكن التفاصيل؟',
  'عايز أعرف أسعار الفيلات في التجمع الخامس',
  'فيه عروض على الشقق الاستثمارية حالياً؟',
  'عايز أحجز معاينة للأسبوع الجاي',
  'بسأل عن نظام الدفع والتقسيط المتاح'
];

function simulateIncomingWhatsApp() {
  if (!isAdmin()) { showToast('التجربة متاحة للمدير فقط'); return; }
  const name = FAKE_CLIENTS[Math.floor(Math.random() * FAKE_CLIENTS.length)];
  const phone = '010' + String(Math.floor(10000000 + Math.random() * 89999999));
  const message = FAKE_MESSAGES[Math.floor(Math.random() * FAKE_MESSAGES.length)];
  const now = new Date();
  const time = todayISO() + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

  const customer = {
    id: uid('cus'), name, phone, source: 'واتساب', status: STATUS.NEW,
    assignedTo: null, propertyId: '', value: 0, createdAt: todayISO(),
    notes: [], activities: [], conversation: []
  };
  customer.conversation.push({ id: uid('msg'), direction: 'in', text: message, time });

  const emp = DataStore.autoAssignCustomer(customer);
  const all = DataStore.getCustomers();
  all.push(customer);
  DataStore.saveCustomers(all);
  DataStore.logActivity('رسالة واتساب واردة',
    `محاكاة عميل: "${name}" — ${message}${emp ? ' → أُسند إلى ' + emp.name : ''}`);

  showToast(emp ? `✅ استقبلنا رسالة من ${name} — أُسندت تلقائياً إلى ${emp.name}` : 'تم استقبال الرسالة');
  if (CURRENT_VIEW === 'dashboard') renderDashboard();
}

$('#simulateBtn').addEventListener('click', simulateIncomingWhatsApp);

$('#exportBtn').addEventListener('click', () => {
  const data = DataStore.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nexus-crm-backup-${todayISO()}.json`;
  a.click();
});

$('#importInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      DataStore.importAll(payload);
      showToast('تم استيراد البيانات بنجاح');
      renderAdminPage();
    } catch (err) {
      showToast('ملف غير صالح');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('سيتم استبدال كل البيانات الحالية بالبيانات التجريبية. متابعة؟')) return;
  DataStore.resetDemoData();
  showToast('تم استعادة البيانات التجريبية');
  renderAdminPage();
});

/* ============================================================
   البحث العام في الشريط العلوي
   ============================================================ */
$('#globalSearch').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const term = e.target.value.trim().toLowerCase();
  if (!term) return;
  const match = visibleCustomers().find(c => c.name.toLowerCase().includes(term) || (c.phone || '').includes(term));
  if (match) { openCustomer(match.id); e.target.value = ''; }
  else showToast('لا يوجد عميل مطابق');
});

/* ============================================================
   نقطة البداية
   ============================================================ */
boot();
