-- WTT V2 database migration. Existing V1 data is not deleted.
create extension if not exists pgcrypto;
create table if not exists public.v2_users (
 id uuid primary key default gen_random_uuid(), name text not null unique,
 role text not null check (role in ('admin','worker')),
 colour text not null default '#64748b', pin_hash text, failed_attempts integer not null default 0, locked_until timestamptz,
 active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.v2_jobs (
 id uuid primary key default gen_random_uuid(), job_number text not null unique,
 client text not null, contact text, rego_vin text, start_date date,
 completion_date date, description text not null default '', instructions text,
 status text not null default 'open' check (status in ('open','in_progress','on_hold','completed')),
 created_by uuid references public.v2_users(id), created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.v2_assignments (
 job_id uuid not null references public.v2_jobs(id) on delete cascade,
 user_id uuid not null references public.v2_users(id), primary key(job_id,user_id)
);
create table if not exists public.v2_shifts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.v2_users(id),
 started_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.v2_breaks (
 id uuid primary key default gen_random_uuid(), shift_id uuid not null references public.v2_shifts(id),
 started_at timestamptz not null default now(), ended_at timestamptz
);
create table if not exists public.v2_work (
 id uuid primary key default gen_random_uuid(), job_id uuid not null references public.v2_jobs(id),
 user_id uuid not null references public.v2_users(id), started_at timestamptz not null default now(),
 ended_at timestamptz, notes text not null default ''
);
-- The browser never queries these tables directly. All access is via the Netlify API.
do $$ declare t text; begin
 foreach t in array array['v2_users','v2_jobs','v2_assignments','v2_shifts','v2_breaks','v2_work'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
 end loop;
end $$;
-- Lock down the obsolete V1 public API. V2 uses service-role server calls only.
do $$ declare t text; begin
 foreach t in array array['businesses','staff','job_templates','planned_jobs','jobs','shifts','breaks','job_time_segments','submissions','email_logs'] loop
  if to_regclass('public.'||t) is not null then
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('drop policy if exists "Allow all for anon" on public.%I',t);
  end if;
 end loop;
end $$;
