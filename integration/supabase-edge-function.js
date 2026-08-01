/* ============================================================
   Nexus CRM — Supabase Edge Function
   ويب هوك استقبال واتساب + ماسنجر (بديل احترافي لـ Apps Script)
   ------------------------------------------------------------
   المميزات: يعمل على سيرفر سحابي مجاني، يكتب مباشرة في قاعدة
   البيانات المشتركة، ويزوّد الموظفين بمزامنة لحظية حقيقية.

   خطوات التفعيل:
   1) من Supabase ← Edge Functions ← New Function باسم webhook
   2) الصق هذا الكود
   3) اضبط المتغيرات السرية (Secrets):
        WA_TOKEN       = توكن واتساب أعمال
        WA_PHONE_ID    = معرف رقم الهاتف
        VERIFY_TOKEN   = نفس القيمة اللي هتكتبها في Meta
        PAGE_TOKEN     = توكن صفحة فيسبوك (ماسنجر)
   4) انشر، وخذ رابط الدالة مثل:
        https://<project>.functions.supabase.co/webhook
   5) ضع الرابط في إعدادات Meta (WhatsApp + Messenger).
   ============================================================ */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VERIFY_TOKEN = Deno.env.get('VERIFY_TOKEN') || 'nexus_crm_verify_2026';
const WA_TOKEN = Deno.env.get('WA_TOKEN');
const WA_PHONE_ID = Deno.env.get('WA_PHONE_ID');

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// أسماء موظفيك (تُقرأ فعلياً من جدول employees)
async function getEmployees() {
  const { data } = await supabase.from('employees').select('*').eq('role', 'employee');
  return data || [];
}

// التوزيع العادل: أقل موظف عملاءً مفتوحين
async function pickEmployee() {
  const employees = await getEmployees();
  if (!employees.length) return null;
  const counts = await Promise.all(employees.map(async (e) => {
    const { count } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', e.id)
      .not('status', 'in', '("منجز","مغلق")');
    return { emp: e, count: count || 0 };
  }));
  counts.sort((a, b) => a.count - b.count);
  return counts[0].emp;
}

// إرسال واتساب
async function sendWhatsApp(to, message) {
  if (!WA_TOKEN || !WA_PHONE_ID) return;
  await fetch(`https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: String(to).replace(/\D/g, ''),
      type: 'text',
      text: { body: message }
    })
  });
}

async function upsertLead({ name, phone, source, message }) {
  const emp = await pickEmployee();
  const { data } = await supabase
    .from('leads')
    .insert({
      id: crypto.randomUUID(),
      name,
      phone,
      source,
      status: 'جديد',
      assigned_to: emp ? emp.id : null,
      conversation: message ? JSON.stringify([{ direction: 'in', text: message, time: new Date().toISOString() }]) : '[]'
    })
    .select()
    .single();

  if (emp) {
    await sendWhatsApp(emp.phone || '',
      `🆕 عميل جديد من ${source}\nالاسم: ${name}\nالهاتف: ${phone}\nتواصل معه الآن من نظام CRM`);
  }
  if (phone && phone.length > 9) {
    await sendWhatsApp(phone, `أهلاً ${name} 👋 استلمنا طلبك وسيتواصل معك مختص المبيعات خلال دقائق.`);
  }
  return data;
}

Deno.serve(async (req) => {
  // تحقق GET من Meta
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // استقبال POST
  if (req.method === 'POST') {
    const event = await req.json();
    if (event.object === 'whatsapp_business_account') {
      for (const entry of event.entry || []) {
        for (const change of entry.changes || []) {
          const value = change.value || {};
          const contacts = value.contacts || [];
          for (const msg of value.messages || []) {
            const name = (contacts[0]?.profile?.name) || `عميل واتساب ${msg.from.slice(-4)}`;
            await upsertLead({
              name,
              phone: msg.from,
              source: 'واتساب',
              message: msg.text?.body || ''
            });
          }
        }
      }
    } else if (event.object === 'page') {
      for (const entry of event.entry || []) {
        for (const m of entry.messaging || []) {
          const psid = m.sender?.id;
          const text = m.message?.text;
          if (psid && text) {
            await upsertLead({
              name: `عميل ماسنجر ${psid.slice(-4)}`,
              phone: psid,
              source: 'ماسنجر مشكاة',
              message: text
            });
          }
        }
      }
    }
    return new Response('OK', { status: 200 });
  }

  return new Response('Method not allowed', { status: 405 });
});
