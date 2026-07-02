-- WTT Job Tracker - Supabase database setup
-- Development/prototype setup.
-- This creates a multi-business structure so the app can later support other companies.

create extension if not exists pgcrypto;

-- Clean existing prototype tables if they exist.
-- Safe only if this is your clean/new Supabase project.
drop table if exists job_time_segments cascade;
drop table if exists breaks cascade;
drop table if exists submissions cascade;
drop table if exists shifts cascade;
drop table if exists planned_jobs cascade;
drop table if exists job_templates cascade;
drop table if exists staff cascade;
drop table if exists businesses cascade;

create table businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_path text,
  primary_colour text default '#00a9d6',
  boss_password text not null default 'emily888',
  notification_email text default 'emilythomasmail@gmail.com',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table job_templates (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table planned_jobs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  work_date date not null,
  staff_id uuid not null references staff(id) on delete cascade,
  job_number integer not null default 1,
  name text not null,
  specific_instructions text,
  staff_notes text,
  status text not null default 'not_started'
    check (status in ('not_started', 'running', 'paused', 'finished')),
  actual_start timestamptz,
  actual_end timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  work_date date not null,
  staff_id uuid not null references staff(id) on delete cascade,
  clock_in timestamptz,
  clock_out timestamptz,
  on_break boolean not null default false,
  break_started_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, work_date, staff_id)
);

create table breaks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  work_date date not null,
  staff_id uuid not null references staff(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table job_time_segments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  planned_job_id uuid not null references planned_jobs(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  work_date date not null,
  staff_id uuid not null references staff(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index idx_staff_business on staff(business_id);
create index idx_templates_business on job_templates(business_id);
create index idx_jobs_business_date on planned_jobs(business_id, work_date);
create index idx_jobs_staff_date on planned_jobs(staff_id, work_date);
create index idx_shifts_business_date on shifts(business_id, work_date);
create index idx_breaks_business_date on breaks(business_id, work_date);
create index idx_segments_job on job_time_segments(planned_job_id);
create index idx_submissions_business_date on submissions(business_id, work_date);

-- Prototype permissions.
-- This allows the browser app to read/write during development.
-- Before real business use, we will replace this with proper auth + RLS policies.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- Seed Warrnambool Trays & Trailers.
insert into businesses (name, slug, logo_path, boss_password, notification_email)
values (
  'Warrnambool Trays & Trailers',
  'warrnambool-trays-trailers',
  'assets/logos/wtt-logo.png',
  'emily888',
  'emilythomasmail@gmail.com'
);

insert into staff (business_id, name, display_order)
select businesses.id, seed.name, seed.display_order
from businesses,
(values
  ('Josh', 1),
  ('Jol', 2),
  ('Dylan', 3)
) as seed(name, display_order)
where businesses.slug = 'warrnambool-trays-trailers';

insert into job_templates (business_id, name, display_order)
select businesses.id, seed.name, seed.display_order
from businesses,
(values
  ('Build trailer tray', 1),
  ('Weld repair', 2),
  ('Parts pickup', 3),
  ('Clean workshop', 4),
  ('Axle replacement', 5),
  ('Electrical work', 6),
  ('Service trailer', 7),
  ('Delivery', 8)
) as seed(name, display_order)
where businesses.slug = 'warrnambool-trays-trailers';
