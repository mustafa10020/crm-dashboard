/* ============================================================
   Nexus CRM — Google Apps Script Webhook (نموذج الموقع / اتصل بنا)
   ------------------------------------------------------------
   الوظيفة: يستقبل بيانات العملاء القادمة من نموذج الموقع
   (lead-capture.html أو نموذج "اتصل بنا/راسلنا" في موقع مشكاة)
   ويخزّنها في Google Sheet — ثم يمكن للمدير استيرادها للـ CRM
   أو إرسالها للموظف المختار تلقائياً عبر واتساب.

   طريقة التفعيل (مرة واحدة، بدون أي تكلفة):
   1) افتح https://script.google.com وأنشئ مشروع جديد.
   2) الصق هذا الكود كاملاً مكان الكود الموجود.
   3) من قائمة "التشغيل" Run ← اختر الدالة setupSheet لأول مرة فقط
      وسيطلب أذوناتك (وافق).
   4) من قائمة "نشر" ← "نشر كتطبيق ويب":
        - تنفيذ كـ: أنا
        - الوصول: أي شخص لديه رابط  (Anyone)
        - انشر، وانسخ الرابط الذي يظهر.
   5) ضع الرابط في lead-capture.html (متغير WEBHOOK_URL)
      أو في إعدادات الربط داخل نظام CRM (حقل نموذج الموقع).

   مهم: أي تعديل بعد النشر → عد إلى "نشر" و"إدارة النشر" ثم
   اضغط "نسخة جديدة" لتحديث الرابط.
   ============================================================ */

// الـ Sheet الرئيسي الذي تُخزَّن فيه العملاء
var SHEET_NAME = 'CRM_Leads';
var PROPERTIES_SHEET = 'CRM_Properties';

function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['الوقت', 'الاسم', 'الهاتف', 'المصدر', 'العقار', 'الرسالة', 'الموظف المسؤول', 'الحالة']);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Nexus CRM Webhook يعمل ✅ (استخدم POST للإرسال)');
}

/* النقطة الرئيسية: تستقبل POST من نموذج الموقع */
function doPost(e) {
  var out = { ok: false, message: '' };
  try {
    var body = e.postData ? e.postData.contents : '';
    var data = JSON.parse(body);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) setupSheet();

    var employee = pickEmployee(); // التوزيع العادل
    sh.appendRow([
      data.time || new Date().toISOString(),
      data.name || '',
      data.phone || '',
      data.source || 'موقع',
      data.property || '',
      data.message || '',
      employee,
      'جديد'
    ]);

    out.ok = true;
    out.message = 'تم حفظ العميل وإسناده إلى ' + employee;
  } catch (err) {
    out.message = 'خطأ: ' + err.toString();
  }
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------- التوزيع العادل (يعدّل حسب أسماء موظفيك) ---------- */
var EMPLOYEES = ['بكري سليمان', 'هبة الله طاهر', 'مصطفى الشيخ', 'أحمد فؤاد', 'مريم هاني'];

function pickEmployee() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) return EMPLOYEES[0];
  var data = sh.getDataRange().getValues();
  var counts = {};
  EMPLOYEES.forEach(function (e) { counts[e] = 0; });
  for (var i = 1; i < data.length; i++) {
    var emp = data[i][6]; // عمود الموظف المسؤول
    if (emp && counts.hasOwnProperty(emp)) counts[emp]++;
  }
  var best = EMPLOYEES[0];
  var min = Infinity;
  EMPLOYEES.forEach(function (e) {
    if (counts[e] < min) { min = counts[e]; best = e; }
  });
  return best;
}

/* ---------- (اختياري) إرسال إشعار واتساب للموظف — يتطلب WhatsApp Business API ----------
   بعد تفعيل Meta Cloud API ضع التوكن والرقم هنا، وسيُستدعى تلقائياً.
*/
function sendWhatsApp(phoneNumber, message) {
  var TOKEN = PropertiesService.getScriptProperties().getProperty('WA_TOKEN');
  if (!TOKEN) return;
  var PHONE_ID = PropertiesService.getScriptProperties().getProperty('WA_PHONE_ID');
  var url = 'https://graph.facebook.com/v19.0/' + PHONE_ID + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: { body: message }
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + TOKEN },
    payload: JSON.stringify(payload)
  });
}
