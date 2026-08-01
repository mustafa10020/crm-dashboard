/* ============================================================
   طبقة البيانات — Storage Layer
   كل البيانات تُخزَّن في LocalStorage (لأن المشروع مستضاف على
   GitHub Pages وهو استضافة ملفات ثابتة بدون سيرفر أو قاعدة بيانات).
   ملاحظة مهمة: البيانات محفوظة داخل متصفح كل جهاز على حدة، ولا
   تتزامن تلقائياً بين موظف وآخر. لمزامنة حقيقية بين كل الموظفين
   لازم قاعدة بيانات سحابية (مثل Firebase) — راجع README.
   ============================================================ */

const DB_KEYS = {
  EMPLOYEES: 'crm_employees',
  CUSTOMERS: 'crm_customers',
  SESSION: 'crm_session',
  SETTINGS: 'crm_settings',
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
    { id: 'emp_admin', name: 'مدير النظام', username: 'admin', password: 'admin123', role: 'admin', color: '#4F46E5' },
    { id: 'emp_1', name: 'أحمد فؤاد', username: 'ahmed', password: '123456', role: 'employee', color: '#0EA5A5' },
    { id: 'emp_2', name: 'سارة يوسف', username: 'sara', password: '123456', role: 'employee', color: '#D97706' }
  ];
}

function seedCustomers() {
  const now = todayISO();
  return [
    {
      id: uid('cus'), name: 'محمد عبد الله', phone: '01012345678', email: '', source: 'فيسبوك',
      status: STATUS.NEW, assignedTo: 'emp_1', value: 15000, createdAt: now,
      notes: [], activities: [
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
      notes: [], activities: [
        { id: uid('act'), text: 'متابعة العرض المُرسل', type: 'followup', date: now, done: false }
      ],
      conversation: []
    },
    {
      id: uid('cus'), name: 'خالد حسن', phone: '01055566677', email: '', source: 'موقع',
      status: STATUS.DONE, assignedTo: 'emp_1', value: 60000, createdAt: now,
      notes: [], activities: [], conversation: []
    },
    {
      id: uid('cus'), name: 'ياسمين عادل', phone: '01234567890', email: '', source: 'إعلان',
      status: STATUS.DELAY, assignedTo: 'emp_2', value: 8000, createdAt: daysFromNow(-5),
      notes: [], activities: [
        { id: uid('act'), text: 'العميل لم يرد منذ 5 أيام', type: 'delay', date: daysFromNow(-1), done: false }
      ], conversation: []
    },
    {
      id: uid('cus'), name: 'عمر شوقي', phone: '01011122233', email: '', source: 'فيسبوك',
      status: STATUS.ON_GOING, assignedTo: 'emp_1', value: 27000, createdAt: now,
      notes: [], activities: [
        { id: uid('act'), text: 'اجتماع لعرض المواصفات النهائية', type: 'meeting', date: daysFromNow(2), done: false }
      ], conversation: []
    }
  ];
}

/* ---------- Public data API ---------- */
const DataStore = {
  init() {
    if (!localStorage.getItem(DB_KEYS.EMPLOYEES)) {
      saveJSON(DB_KEYS.EMPLOYEES, seedEmployees());
    }
    if (!localStorage.getItem(DB_KEYS.CUSTOMERS)) {
      saveJSON(DB_KEYS.CUSTOMERS, seedCustomers());
    }
    if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
      saveJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 12 });
    }
  },

  getEmployees() { return loadJSON(DB_KEYS.EMPLOYEES, []); },
  saveEmployees(list) { return saveJSON(DB_KEYS.EMPLOYEES, list); },

  getCustomers() { return loadJSON(DB_KEYS.CUSTOMERS, []); },
  saveCustomers(list) { return saveJSON(DB_KEYS.CUSTOMERS, list); },

  getSettings() { return loadJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 0 }); },
  saveSettings(s) { return saveJSON(DB_KEYS.SETTINGS, s); },

  getSession() { return loadJSON(DB_KEYS.SESSION, null); },
  setSession(s) { return saveJSON(DB_KEYS.SESSION, s); },
  clearSession() { localStorage.removeItem(DB_KEYS.SESSION); },

  exportAll() {
    return {
      employees: this.getEmployees(),
      customers: this.getCustomers(),
      settings: this.getSettings(),
      exportedAt: new Date().toISOString()
    };
  },

  importAll(payload) {
    if (payload.employees) this.saveEmployees(payload.employees);
    if (payload.customers) this.saveCustomers(payload.customers);
    if (payload.settings) this.saveSettings(payload.settings);
  },

  resetDemoData() {
    saveJSON(DB_KEYS.EMPLOYEES, seedEmployees());
    saveJSON(DB_KEYS.CUSTOMERS, seedCustomers());
    saveJSON(DB_KEYS.SETTINGS, { companyName: 'شركتي', rotationCount: 12 });
  }
};
