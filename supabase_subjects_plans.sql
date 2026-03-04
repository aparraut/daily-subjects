-- Run this in Supabase SQL Editor after supabase_security.sql.
-- Purpose:
-- 1) Per-user subject catalog with soft-delete (archive) support.
-- 2) Optional study plans by date range with selected subjects.
-- 3) Preserve historical daily_subjects rows even when subjects are archived.

create table if not exists public.user_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_archived boolean not null default false,
  archived_at timestamptz null,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists user_subjects_user_name_uk
on public.user_subjects (user_id, lower(name));

create table if not exists public.subject_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  constraint subject_plans_valid_range_ck check (end_date >= start_date)
);

create table if not exists public.subject_plan_items (
  plan_id uuid not null references public.subject_plans(id) on delete cascade,
  subject_name text not null,
  created_at timestamptz not null default now(),
  primary key (plan_id, subject_name)
);

alter table public.user_subjects enable row level security;
alter table public.subject_plans enable row level security;
alter table public.subject_plan_items enable row level security;

drop policy if exists "user_subjects_select_own" on public.user_subjects;
drop policy if exists "user_subjects_insert_own" on public.user_subjects;
drop policy if exists "user_subjects_update_own" on public.user_subjects;
drop policy if exists "user_subjects_delete_own" on public.user_subjects;

create policy "user_subjects_select_own"
on public.user_subjects
for select
to authenticated
using (auth.uid() = user_id);

create policy "user_subjects_insert_own"
on public.user_subjects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "user_subjects_update_own"
on public.user_subjects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "user_subjects_delete_own"
on public.user_subjects
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "subject_plans_select_own" on public.subject_plans;
drop policy if exists "subject_plans_insert_own" on public.subject_plans;
drop policy if exists "subject_plans_update_own" on public.subject_plans;
drop policy if exists "subject_plans_delete_own" on public.subject_plans;

create policy "subject_plans_select_own"
on public.subject_plans
for select
to authenticated
using (auth.uid() = user_id);

create policy "subject_plans_insert_own"
on public.subject_plans
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "subject_plans_update_own"
on public.subject_plans
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "subject_plans_delete_own"
on public.subject_plans
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "subject_plan_items_select_own" on public.subject_plan_items;
drop policy if exists "subject_plan_items_insert_own" on public.subject_plan_items;
drop policy if exists "subject_plan_items_update_own" on public.subject_plan_items;
drop policy if exists "subject_plan_items_delete_own" on public.subject_plan_items;

create policy "subject_plan_items_select_own"
on public.subject_plan_items
for select
to authenticated
using (
  exists (
    select 1
    from public.subject_plans p
    where p.id = subject_plan_items.plan_id
      and p.user_id = auth.uid()
  )
);

create policy "subject_plan_items_insert_own"
on public.subject_plan_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.subject_plans p
    where p.id = subject_plan_items.plan_id
      and p.user_id = auth.uid()
  )
);

create policy "subject_plan_items_update_own"
on public.subject_plan_items
for update
to authenticated
using (
  exists (
    select 1
    from public.subject_plans p
    where p.id = subject_plan_items.plan_id
      and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.subject_plans p
    where p.id = subject_plan_items.plan_id
      and p.user_id = auth.uid()
  )
);

create policy "subject_plan_items_delete_own"
on public.subject_plan_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.subject_plans p
    where p.id = subject_plan_items.plan_id
      and p.user_id = auth.uid()
  )
);
