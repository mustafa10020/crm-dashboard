/* ============================================================
   Nexus CRM — طبقة البيانات (Storage Layer)
   كل البيانات تُخزَّن في LocalStorage (لأن المشروع مستضاف على
   GitHub Pages وهو استضافة ملفات ثابتة بدون سيرفر أو قاعدة بيانات).
   ملاحظة مهمة: البيانات محفوظة داخل متصفح كل جهاز على حدة، ولا
   تتزامن تلقائياً بين موظف وآخر. لمزامنة حقيقية بين كل الموظفين
   لازم قاعدة بيانات سحابية (Supabase/Firebase) — راجع INTEGRATION-GUIDE.md
   ============================================================ */

const DB_KEYS = {
  EMPLOYEES: 'crm_employees',
  CUSTOMERS: 'crm_customers',
  PROPERTIES: 'crm_properties',
  SESSION: 'crm_session',
  SETTINGS: 'crm_settings',
  INTEGRATION: 'crm_integration',
  ACTIVITY_LOG: 'crm_activity_log'
};

const STATUS = {
  NEW: 'جديد',
  START_ACTION: 'قيد الإجراء',
  ON_GOING: 'قيد التنفيذ',
  DONE: 'منجز',
  CLOSED: 'مغلق',
  NOT_COMM: 'غير متواصل',
  DELAY: 'متأخر'
};

const STATUS_COLORS = {
  [STATUS.NEW]: 'blue',
  [STATUS.START_ACTION]: 'orange',
  [STATUS.ON_GOING]: 'purple',
  [STATUS.DONE]: 'green',
  [STATUS.CLOSED]: 'lime',
  [STATUS.NOT_COMM]: 'gray',
  [STATUS.DELAY]: 'red'
};

/* حالة العقار (قسم التسويق العقاري) */
const PROPERTY_STATUS = {
  AVAILABLE: 'متاح',
  RESERVED: 'محجوز',
  SOLD: 'مباع'
};

const PROPERTY_STATUS_COLORS = {
  [PROPERTY_STATUS.AVAILABLE]: 'green',
  [PROPERTY_STATUS.RESERVED]: 'orange',
  [PROPERTY_STATUS.SOLD]: 'lime'
};

function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ---------- Generic storage helpers ---------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('storage read error', key, e);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('storage write error', key, e);
    return false;
  }
}

/* ---------- Seed data (تُستخدم أول مرة فقط) ---------- */
function seedEmployees() {
  return [
    { id: 'emp_admin', name: 'مدير النظام', username: 'admin', password: 'admin123', role: 'admin', color: '#4F46E5', phone: '' },
    { id: 'emp_1', name: 'بكري سليمان', username: 'bakri', password: '123456', role: 'employee', color: '#0EA5A5', phone: '' },
    { id: 'emp_2', name: 'هبة الله طاهر', username: 'heba', password: '123456', role: 'employee', color: '#D97706', phone: '' },
    { id: 'emp_3', name: 'مصطفى الشيخ', username: 'mostafa', password: '123456', role: 'employee', color: '#DB2777', phone: '' },
    { id: 'emp_4', name: 'أحمد فؤاد', username: 'ahmed', password: '123456', role: 'employee', color: '#16A34A', phone: '' },
    { id: 'emp_5', name: 'مريم هاني', username: 'maryam', password: '123456', role: 'employee', color: '#7C3AED', phone: '' }
  ];
}

function seedCustomers() {
  const now = todayISO();
  return [
    {
      id: uid('cus'), name: 'محمد عبد الله', phone: '01012345678', email: '', source: 'فيسبوك',
      status: STATUS.NEW, assignedTo: 'emp_1', value: 15000, createdAt: now,
      propertyId: '', notes: [], activities: [
        { id: uid('act'), text: 'مكالمة تعريفية بالمنتج', type: 'call', date: daysFromNow(1), done: false }
      ],
      conversation: [
        { id: uid('msg'), direction: 'in', text: 'عايز أعرف تفاصيل الأسعار', time: now + ' 09:12' },
        { id: uid('msg'), direction: 'out', text: 'أهلاً بيك، هبعتلك الكتالوج دلوقتي', time: now + ' 09:15' }
      ]
    },
    {
      id: uid('cus'), name: 'منى الشربيني', phone: '01098765432', email: '', source: 'إحالة',
      status: STATUS.START_ACTION, assignedTo: 'emp_2', value: 42000, createdAt: now,
      propertyId: '', notes: [], activities: [
        { id: uid('act'), text: 'متابعة العرض المُرسل', type: 'followup', date: now, done: false }
      ],
      conversation: []
    },
    {
      id: uid('cus'), name: 'خالد حسن', phone: '01055566677', email: '', source: 'موقع',
      status: STATUS.DONE, assignedTo: 'emp_4', value: 60000, createdAt: now,
      propertyId: '', notes: [], activities: [], conversation: []
    },
    {
      id: uid('cus'), name: 'ياسمين عادل', phone: '01234567890', email: '', source: 'إعلان',
      status: STATUS.DELAY, assignedTo: 'emp_3', value: 8000, createdAt: daysFromNow(-5),
      propertyId: '', notes: [], activities: [
        { id: uid('act'), text: 'العميل لم يرد منذ 5 أيام', type: 'delay', date: daysFromNow(-1), done: false }
      ], conversation: []
    },
    {
      id: uid('cus'), name: 'عمر شوقي', phone: '01011122233', email: '', source: 'فيسبوك',
      status: STATUS.ON_GOING, assignedTo: 'emp_5', value: 27000, createdAt: now,
      propertyId: '', notes: [], activities: [
        { id: uid('act'), text: 'اجتماع لعرض المواصفات النهائية', type: 'meeting', date: daysFromNow(2), done: false }
      ], conversation: []
    }
  ];
}

function seedProperties() {
  return [
    { id: uid('prop'), title: 'شقة 220 متر — التجمع الخامس', area: '220 م²', price: 6300000, location: 'الحي الثامن – بيت الوطن', status: PROPERTY_STATUS.AVAILABLE, source: 'موقع', createdAt: todayISO() },
    { id: uid('prop'), title: 'فيلا 340 متر — مدينة نصر', area: '340 م²', price: 12000000, location: 'مدينة نصر', status: PROPERTY_STATUS.AVAILABLE, source: 'إعلان', createdAt: todayISO() },
    { id: uid('prop'), title: 'شقة 150 متر — العاصمة الإدارية', area: '150 م²', price: 4800000, location: 'الحى السكني السابع', status: PROPERTY_STATUS.RESERVED, source: 'فيسبوك', createdAt: todayISO() }
  ];
}

function defaultIntegration() {
  return {
    distributionMode: 'count',            // 'count' = توزيع عادل بالعدد أولاً، 'performance' = حسب الكفاءة لاحقاً
    whatsappEnabled: false,
    whatsappNumber: '',                   // رقم واتساب الشركة (بصيغة دولية بدون +)
    whatsappToken: '',                    // توكن WhatsApp Business Cloud API
    whatsappWebhook: '',                  // عنوان Webhook مستقبل للرسائل (نضعه في حساب Meta)
    sheetsWebhook: '',                    // رابط Google Apps Script (نموذج الموقع / اتصل بنا)
    supabaseUrl: '',
    supabaseKey: '',
    messengerEnabled: false,
    messengerPageToken: ''
  };
}

/* ---------- التوزيع العادل على الموظفين ---------- */
function employeeScore(emp, customers, mode) {
  const mine = customers.filter(c => c.assignedTo === emp.id);
  const openLeads = mine.filter(c => c.status !== STATUS.DONE && c.status !== STATUS.CLOSED).length;
  const closedLeads = mine.filter(c => c.status === STATUS.DONE || c.status === STATUS.CLOSED).length;
  // أولاً: التوزيع العادل بالعدد (أقل حمل أولاً)
  if (mode === 'count') return { load: openLeads, score: openLeads };
  // لاحقاً: حسب الكفاءة = يخلط بين الحمل والموهبة في الإغلاق (نسبة إغلاق أعلى = أولوية أعلى)
  const capacity = Math.max(openLeads + closedLeads, 1);
  const closureRate = closedLeads / capacity;
  return { load: openLeads, score: openLeads * (1.1 - closureRate) };
}

function pickBestEmployee(mode) {
  const employees = loadJSON(DB_KEYS.EMPLOYEES, []).filter(e => e.role === 'employee');
  const customers = loadJSON(DB_KEYS.CUSTOMERS, []);
  if (!employees.length) return null;
  employees.sort((a, b) => employeeScore(a, customers, mode).score - employeeScore(b, customers, mode).score);
  return employees[0];
}

/* ---------- Public data API ---------- */
const DataStore = {
  init() {
    if (!localStorage.getItem(DB_KEYS.EMPLOYEES)) saveJSON(DB_KEYS.EMPLOYEES, seedEmployees());
    if (!localStorage.getItem(DB_KEYS.CUSTOMERS)) saveJSON(DB_KEYS.CUSTOMERS, seedCustomers());
    if (!localStorage.getItem(DB_KEYS.PROPERTIES)) saveJSON(DB_KEYS.PROPERTIES, seedProperties());
    if (!localStorage.getItem(DB_KEYS.SETTINGS)) saveJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 12 });
    if (!localStorage.getItem(DB_KEYS.INTEGRATION)) saveJSON(DB_KEYS.INTEGRATION, defaultIntegration());
  },

  getEmployees() { return loadJSON(DB_KEYS.EMPLOYEES, []); },
  saveEmployees(list) { return saveJSON(DB_KEYS.EMPLOYEES, list); },

  getCustomers() { return loadJSON(DB_KEYS.CUSTOMERS, []); },
  saveCustomers(list) { return saveJSON(DB_KEYS.CUSTOMERS, list); },

  getProperties() { return loadJSON(DB_KEYS.PROPERTIES, []); },
  saveProperties(list) { return saveJSON(DB_KEYS.PROPERTIES, list); },

  getSettings() { return loadJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 0 }); },
  saveSettings(s) { return saveJSON(DB_KEYS.SETTINGS, s); },

  getIntegration() { return Object.assign(defaultIntegration(), loadJSON(DB_KEYS.INTEGRATION, {})); },
  saveIntegration(i) { return saveJSON(DB_KEYS.INTEGRATION, i); },

  getSession() { return loadJSON(DB_KEYS.SESSION, null); },
  setSession(s) { return saveJSON(DB_KEYS.SESSION, s); },
  clearSession() { localStorage.removeItem(DB_KEYS.SESSION); },

  /* ----- توزيع عادل ----- */
  // يرجع أفضل موظف حسب وضع التوزيع الحالي، ويسجّل سجل توزيع (للتقرير اللحظي)
  autoAssignCustomer(customer) {
    const cfg = this.getIntegration();
    const emp = pickBestEmployee(cfg.distributionMode);
    if (emp) {
      customer.assignedTo = emp.id;
      customer.distributedAt = todayISO();
      this.logActivity('توزيع تلقائي', `تم إسناد "${customer.name}" إلى ${emp.name} (وضع: ${cfg.distributionMode === 'performance' ? 'الكفاءة' : 'العدالة'})`);
    }
    return emp;
  },

  // يعيد توزيع كل العملاء بدون موظف مسؤول
  distributeUnassigned() {
    const all = this.getCustomers();
    let count = 0;
    all.forEach(c => {
      if (!c.assignedTo) { if (this.autoAssignCustomer(c)) count++; }
    });
    this.saveCustomers(all);
    return count;
  },

  // يُرسل العميل الجديد إلى كل وسيلة ربط مفعّلة (نموذج موقع / واتساب / Supabase)
  submitToWebhooks(customer) {
    const cfg = this.getIntegration();
    const payload = { type: 'lead', data: customer };
    const urls = [];
    if (cfg.sheetsWebhook) urls.push(cfg.sheetsWebhook);
    if (cfg.supabaseUrl && cfg.supabaseKey) urls.push(cfg.supabaseUrl + '/rest/v1/leads');
    urls.forEach(url => {
      try {
        const headers = {};
        if (url.includes('/rest/v1/leads')) headers['apikey'] = cfg.supabaseKey;
        headers['Content-Type'] = 'application/json';
        fetch(url, { method: 'POST', headers, body: JSON.stringify(cfg.supabaseUrl && url.includes('/rest/v1/leads') ? customer : payload) }).catch(() => {});
      } catch (e) { /* noop */ }
    });
  },

  /* ----- سجل الأنشطة اللحظي (تقرير كل خطوة) ----- */
  logActivity(action, text, meta) {
    const log = loadJSON(DB_KEYS.ACTIVITY_LOG, []);
    log.unshift({ id: uid('log'), action, text, meta: meta || {}, time: new Date().toISOString() });
    saveJSON(DB_KEYS.ACTIVITY_LOG, log.slice(0, 200));
    return log;
  },
  getActivityLog() { return loadJSON(DB_KEYS.ACTIVITY_LOG, []); },

  exportAll() {
    return {
      employees: this.getEmployees(),
      customers: this.getCustomers(),
      properties: this.getProperties(),
      settings: this.getSettings(),
      integration: this.getIntegration(),
      exportedAt: new Date().toISOString()
    };
  },

  importAll(payload) {
    if (payload.employees) this.saveEmployees(payload.employees);
    if (payload.customers) this.saveCustomers(payload.customers);
    if (payload.properties) this.saveProperties(payload.properties);
    if (payload.settings) this.saveSettings(payload.settings);
    if (payload.integration) this.saveIntegration(payload.integration);
  },

  resetDemoData() {
    saveJSON(DB_KEYS.EMPLOYEES, seedEmployees());
    saveJSON(DB_KEYS.CUSTOMERS, seedCustomers());
    saveJSON(DB_KEYS.PROPERTIES, seedProperties());
    saveJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 12 });
    saveJSON(DB_KEYS.INTEGRATION, defaultIntegration());
  }
};
