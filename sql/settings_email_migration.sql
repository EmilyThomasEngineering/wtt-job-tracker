-- WTT Job Tracker settings/email migration

alter table businesses
add column if not exists auto_submit_time time not null default '17:00',
add column if not exists owner_reset_code text not null default 'emily-owner-reset';

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  work_date date not null,
  staff_id uuid references staff(id) on delete set null,
  email_type text not null,
  recipient text not null,
  subject text not null,
  sent_at timestamptz not null default now()
);

create index if not exists idx_email_logs_business_date
on email_logs(business_id, work_date);

grant select, insert, update, delete on email_logs to anon, authenticated;
