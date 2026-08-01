/* ============================================================
   Nexus CRM — Webhook واتساب + ماسنجر (WhatsApp Business Cloud API)
   ------------------------------------------------------------
   الوظيفة: يستقبل الرسائل الواردة من عملاء الشركة على
   (1) واتساب أعمال   (2) ماسنجر صفحة فيسبوك "مشكاة"
   ثم يقوم تلقائياً بـ:
     • إنشاء/تحديث ملف العميل في Google Sheet
     • التوزيع العادل على الموظفين (أقلهم حملاً أولاً)
     • إرسال إشعار واتساب للموظف المختار ببيانات العميل
     • الرد التلقائي على العميل بأنه سيتواصل معه فريق المبيعات

   --------------------------------------------
   الإعداد (مرة واحدة) — اقرأ INTEGRATION-GUIDE.md للتفاصيل:
   1) أنشئ تطبيق Meta في https://developers.facebook.com
   2) أضف منتج WhatsApp وقم بربط رقم الشركة (يتطلب توثيق رقم).
   3) أضف منتج Messenger واربط صفحة مشكاة على فيسبوك.
   4) الصق هذا الكود في script.google.com كتطبيق ويب جديد
      (نشر كتطبيق ويب، تنفيذ كـ "أنا"، وصول "أي شخص").
   5) ضع الرابط الناتج في إعدادات Meta (Webhook URL)
      مع نفس VERIFY_TOKEN المكتوب بالأسفل.
   6) انسخ VERIFY_TOKEN من إعدادات التطبيق وضعه هنا.
   ============================================================ */

/* ---------- إعداداتك (عدّلها) ---------- */
var VERIFY_TOKEN = 'nexus_crm_verify_2026'; // نفس القيمة في إعدادات Meta Webhook
var SHEET_NAME = 'CRM_Leads';

// أسماء موظفي المبيعات — يُوزَّع عليهم العملاء بالتساوي
var EMPLOYEES = ['بكري سليمان', 'هبة الله طاهر', 'مصطفى الشيخ', 'أحمد فؤاد', 'مريم هاني'];

// أرقام واتساب الموظفين (بالصيغة الدولية بدون +) — لاستقبال إشعارات العملاء الجدد
var EMPLOYEE_PHONES = {
  'بكري سليمان': '2010xxxxxxx1',
  'هبة الله طاهر': '2010xxxxxxx2',
  'مصطفى الشيخ': '2010xxxxxxx3',
  'أحمد فؤاد': '2010xxxxxxx4',
  'مريم هاني': '2010xxxxxxx5'
};

// تخزين آمن للأسرار (أفضل من كتابتها هنا)
// ضعهم من: Properties Service ← Script Properties
//  WA_TOKEN = رمز واتساب (System User token)
//  WA_PHONE_ID = رقم الهاتف الموصول (Phone Number ID)
//  PAGE_TOKEN = توكن صفحة فيسبوك (Page Access Token)
//  PAGE_ID = معرف صفحة مشكاة

var SS_ = SpreadsheetApp.getActiveSpreadsheet();

/* ---------- توثيق الويب هوك (Meta يرسل GET للتحقق) ---------- */
function doGet(e) {
  var mode = e.parameter['hub.mode'];
  var token = e.parameter['hub.verify_token'];
  var challenge = e.parameter['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return ContentService.createTextOutput(challenge);
  }
  return ContentService.createTextOutput('VERIFY_FAILED').setResponseCode(403);
}

/* ---------- استقبال الأحداث ---------- */
function doPost(e) {
  try {
    var body = e.postData.contents;
    var event = JSON.parse(body);

    if (event.object === 'whatsapp_business_account') {
      handleWhatsApp(event);
    } else if (event.object === 'page') {
      handleMessenger(event);
    }
  } catch (err) {
    console.error('Webhook error: ' + err);
  }
  return ContentService.createTextOutput('OK');
}

/* ---------- معالجة رسائل واتساب ---------- */
function handleWhatsApp(event) {
  (event.entry || []).forEach(function (entry) {
    (entry.changes || []).forEach(function (change) {
      var value = change.value || {};
      var msgs = value.messages || [];
      var contacts = value.contacts || [];
      msgs.forEach(function (msg) {
        if (msg.type !== 'text' && msg.type !== 'button') return;
        var profile = (contacts[0] && contacts[0].profile) || {};
        var waId = msg.from;                    // رقم العميل
        var name = profile.name || ('عميل واتساب ' + waId.slice(-4));
        var text = (msg.text && msg.text.body) || '';
        upsertLead({ name: name, phone: waId, source: 'واتساب', message: text });
      });
    });
  });
}

/* ---------- معالجة رسائل ماسنجر ---------- */
function handleMessenger(event) {
  (event.entry || []).forEach(function (entry) {
    (entry.messaging || []).forEach(function (messaging) {
      var sender = messaging.sender || {};
      var message = messaging.message || {};
      if (!sender.id || !message.text) return;
      // نطلب اسم العميل من Graph API (اختياري)
      var name = 'عميل ماسنجر ' + sender.id.slice(-4);
      upsertLead({ name: name, phone: sender.id, source: 'ماسنجر مشكاة', message: message.text, psid: sender.id });
    });
  });
}

/* ---------- إنشاء/تحديث العميل + التوزيع العادل + الإشعار ---------- */
function upsertLead(lead) {
  var sh = SS_.getSheetByName(SHEET_NAME);
  if (!sh) { sh = SS_.insertSheet(SHEET_NAME); sh.appendRow(['الوقت', 'الاسم', 'الهاتف', 'المصدر', 'الرسالة', 'الموظف', 'الحالة']); }

  // منع التكرار: إذا الهاتف موجود مسبقاً نتجاهل الإعادة
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(lead.phone)) return; // عميل موجود
  }

  var employee = pickEmployee(sh);
  sh.appendRow([
    new Date().toISOString(),
    lead.name,
    lead.phone,
    lead.source,
    lead.message || '',
    employee,
    'جديد'
  ]);

  // 1) إشعار الموظف المختار على واتساب
  var empPhone = EMPLOYEE_PHONES[employee];
  if (empPhone) {
    sendWhatsApp(empPhone,
      '🆕 عميل جديد قادم من ' + lead.source + '\n' +
      'الاسم: ' + lead.name + '\n' +
      'الهاتف: ' + lead.phone + '\n' +
      (lead.message ? 'الرسالة: ' + lead.message + '\n' : '') +
      'تواصل معه الآن — راجع ملفه من نظام CRM'
    );
  }

  // 2) رد تلقائي للعميل
  if (lead.phone && lead.phone.length > 9) {
    sendWhatsApp(lead.phone,
      'أهلاً ' + lead.name + ' 👋\n' +
      'استلمنا طلبك وسيتواصل معك أحد مختصي فريق التسويق العقاري خلال دقائق. شكراً لثقتك!'
    );
  }
}

/* ---------- التوزيع العادل: الموظف صاحب أقل عدد عملاء ---------- */
function pickEmployee(sh) {
  var data = sh.getDataRange().getValues();
  var counts = {};
  EMPLOYEES.forEach(function (e) { counts[e] = 0; });
  for (var i = 1; i < data.length; i++) {
    var emp = data[i][5];
    if (emp && counts.hasOwnProperty(emp)) counts[emp]++;
  }
  var best = EMPLOYEES[0], min = Infinity;
  EMPLOYEES.forEach(function (e) { if (counts[e] < min) { min = counts[e]; best = e; } });
  return best;
}

/* ---------- إرسال رسالة واتساب عبر Meta Cloud API ---------- */
function sendWhatsApp(to, message) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('WA_TOKEN');
  var phoneId = props.getProperty('WA_PHONE_ID');
  if (!token || !phoneId) return;
  var url = 'https://graph.facebook.com/v19.0/' + phoneId + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: String(to).replace(/\D/g, ''),
    type: 'text',
    text: { body: message }
  };
  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  console.log('WhatsApp send: ' + resp.getResponseCode());
}

/* ---------- (ماسنجر) إرسال رد تلقائي للعميل عبر صفحة مشكاة ---------- */
function sendMessenger(psid, message) {
  var props = PropertiesService.getScriptProperties();
  var pageToken = props.getProperty('PAGE_TOKEN');
  if (!pageToken || !psid) return;
  var url = 'https://graph.facebook.com/v19.0/me/messages?access_token=' + pageToken;
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      recipient: { id: psid },
      message: { text: message }
    }),
    muteHttpExceptions: true
  });
}

/* ---------- اختبار سريع (من المحرر) ---------- */
function testSendWhatsApp() {
  sendWhatsApp('2010xxxxxxx1', 'اختبار إشعار من نظام Nexus CRM');
}
