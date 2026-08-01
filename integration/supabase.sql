-- ============================================================
-- Nexus CRM — قاعدة بيانات سحابية مشتركة (Supabase)
-- ------------------------------------------------------------
-- الحل الأمثل للمزامنة اللحظية بين كل الموظفين عبر الأجهزة.
-- البيانات لم تعد محفوظة في متصفح كل جهاز، بل في قاعدة بيانات
-- واحدة سحابية يقرأ ويكتب منها كل الموظفين فوراً.
--
-- خطوات التفعيل:
--   1) أنشئ مشروع مجاني على https://supabase.com (بدون كارت).
--   2) من تبويب SQL Editor الصق هذا الملف و"Run".
--   3) من إعدادات المشروع انسخ Project URL و anon key
--      وضعهم في إعدادات الربط داخل نظام CRM.
--   4) فعّل اتصال المزامنة (راجع guide) وسيتزامن كل شيء.
-- ============================================================

-- جدول الموظفين
create table if not exists employees (
  id text primary key,
  name text not null,
  username text unique not null,
  password text not null,
  role text not null default 'employee',
  color text,
  phone text,
  created_at timestamptz default now()
);

-- جدول العملاء (Leads)
create table if not exists leads (
  id text primary key,
  name text not null,
  phone text,
  email text,
  source text,
  status text default 'جديد',
  value numeric default 0,
  assigned_to text references employees(id),
  property_id text,
  notes jsonb default '[]',
  activities jsonb default '[]',
  conversation jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- جدول العقارات (التسويق العقاري)
create table if not exists properties (
  id text primary key,
  title text not null,
  location text,
  area text,
  price numeric default 0,
  status text default 'متاح',
  source text,
  created_at timestamptz default now()
);

-- جدول سجل الأنشطة اللحظي
create table if not exists activity_log (
  id text primary key,
  action text,
  text text,
  employee_id text references employees(id),
  created_at timestamptz default now()
);

-- فهارس للبحث السريع
create index if not exists leads_assigned_idx on leads(assigned_to);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_source_idx on leads(source);

-- ============================================================
-- دالة التوزيع العادل (أقل موظف حملاً أولاً)
-- تُستدعى عند إضافة عميل جديد بدون موظف مسؤول
-- ============================================================
create or replace function assign_lead_fair()
returns trigger as $$
declare
  chosen employees%rowtype;
begin
  select * into chosen
  from employees e
  where e.role = 'employee'
  order by (
    select count(*) from leads l
    where l.assigned_to = e.id
      and l.status not in ('منجز', 'مغلق')
  ) asc
  limit 1;

  if chosen is not null then
    new.assigned_to := chosen.id;
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger: يُسند تلقائياً أي عميل جديد بلا موظف
drop trigger if exists trg_assign_lead on leads;
create trigger trg_assign_lead
  before insert on leads
  for each row
  when (new.assigned_to is null or new.assigned_to = '')
  execute function assign_lead_fair();

-- ============================================================
-- الأمان (Row Level Security)
-- الإدمن يرى الكل، الموظف يرى عملاءه + يستطيع إضافة عملاء.
-- ============================================================
alter table employees enable row level security;
alter table leads enable row level security;
alter table properties enable row level security;
alter table activity_log enable row level security;

create policy "employees_read_all" on employees for select using (true);
create policy "leads_read_own" on leads for select
  using (auth.uid()::text = assigned_to or auth.role() = 'authenticated');
create policy "leads_insert" on leads for insert with check (true);
create policy "leads_update_own" on leads for update
  using (auth.uid()::text = assigned_to or auth.role() = 'authenticated');
create policy "properties_all" on properties for all using (true);
create policy "activity_log_all" on activity_log for all using (true);
