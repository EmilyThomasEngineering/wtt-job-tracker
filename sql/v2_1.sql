-- WTT V2.1 additive migration. Run once in Supabase SQL Editor.
create sequence if not exists public.v2_job_number_seq start with 1100001 increment by 1;
select setval('public.v2_job_number_seq', greatest(1100000,coalesce((select max(job_number::bigint) from public.v2_jobs where job_number ~ '^\d+$'),1100000)), true);
create table if not exists public.v2_clients (id uuid primary key default gen_random_uuid(), name text not null unique, created_at timestamptz default now());
alter table public.v2_clients enable row level security;
revoke all on public.v2_clients from anon, authenticated;
grant select, insert, update, delete on public.v2_clients to service_role;
grant usage, select on sequence public.v2_job_number_seq to service_role;
alter table public.v2_jobs add column if not exists client_id uuid references public.v2_clients(id);
alter table public.v2_jobs add column if not exists contact_name text;
alter table public.v2_jobs add column if not exists contact_phone text;
alter table public.v2_jobs add column if not exists contact_email text;
alter table public.v2_jobs add column if not exists completed_at timestamptz;
alter table public.v2_jobs add column if not exists completed_by uuid references public.v2_users(id);
alter table public.v2_jobs add column if not exists hold_reason text;
-- Existing V2 records remain intact. New jobs get numbers from the sequence server-side.

create or replace function public.v2_next_job_number() returns bigint language sql security definer set search_path=public as $$ select nextval('public.v2_job_number_seq'); $$;
revoke all on function public.v2_next_job_number() from public, anon, authenticated;
grant execute on function public.v2_next_job_number() to service_role;
