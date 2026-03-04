-- Run this in Supabase SQL Editor after supabase_security.sql.
-- Purpose:
-- 1) Per-user subject catalog with soft-delete (archive) support.
-- 2) Optional study plans by date range with selected subjects.
-- 3) Preserve historical daily_subjects rows even when subjects are archived.
-- 4) Harden integrity: no overlapping plans + transactional plan creation.

create extension if not exists btree_gist;

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

alter table public.subject_plan_items add column if not exists subject_id uuid;
alter table public.subject_plan_items add column if not exists subject_name_snapshot text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subject_plan_items_subject_id_fk'
  ) then
    alter table public.subject_plan_items
      add constraint subject_plan_items_subject_id_fk
      foreign key (subject_id)
      references public.user_subjects(id)
      on delete restrict;
  end if;
end $$;

-- Backfill legacy rows that only had subject_name.
update public.subject_plan_items spi
set
  subject_id = us.id,
  subject_name_snapshot = coalesce(spi.subject_name_snapshot, us.name)
from public.subject_plans sp,
     public.user_subjects us
where sp.id = spi.plan_id
  and us.user_id = sp.user_id
  and lower(us.name) = lower(spi.subject_name)
  and spi.subject_id is null;

update public.subject_plan_items
set subject_name_snapshot = coalesce(subject_name_snapshot, subject_name)
where subject_name_snapshot is null;

create unique index if not exists subject_plan_items_plan_subject_id_uk
on public.subject_plan_items (plan_id, subject_id)
where subject_id is not null;

do $$
declare
  null_subject_ids bigint;
  null_subject_snapshots bigint;
begin
  select count(*) into null_subject_ids
  from public.subject_plan_items
  where subject_id is null;

  if null_subject_ids = 0 then
    alter table public.subject_plan_items
      alter column subject_id set not null;
  end if;

  select count(*) into null_subject_snapshots
  from public.subject_plan_items
  where subject_name_snapshot is null;

  if null_subject_snapshots = 0 then
    alter table public.subject_plan_items
      alter column subject_name_snapshot set not null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subject_plans_no_overlap'
  ) then
    alter table public.subject_plans
      add constraint subject_plans_no_overlap
      exclude using gist (
        user_id with =,
        daterange(start_date, end_date, '[]') with &&
      );
  end if;
end $$;

create or replace function public.subject_plan_items_fill_snapshot()
returns trigger
language plpgsql
as $$
declare
  v_name text;
begin
  if new.subject_id is null then
    return new;
  end if;

  select us.name
  into v_name
  from public.user_subjects us
  where us.id = new.subject_id;

  if v_name is null then
    raise exception 'Invalid subject_id for subject_plan_items';
  end if;

  if new.subject_name_snapshot is null then
    new.subject_name_snapshot = v_name;
  end if;

  -- Keep backward compatibility with old column.
  if new.subject_name is null then
    new.subject_name = new.subject_name_snapshot;
  end if;

  return new;
end $$;

drop trigger if exists trg_subject_plan_items_fill_snapshot on public.subject_plan_items;
create trigger trg_subject_plan_items_fill_snapshot
before insert or update on public.subject_plan_items
for each row
execute function public.subject_plan_items_fill_snapshot();

create or replace function public.create_subject_plan(
  p_name text,
  p_start_date date,
  p_end_date date,
  p_subject_ids uuid[]
)
returns public.subject_plans
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_plan public.subject_plans%rowtype;
  v_expected_count integer;
  v_inserted_count integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'start_date and end_date are required';
  end if;

  if p_end_date < p_start_date then
    raise exception 'end_date must be greater than or equal to start_date';
  end if;

  if coalesce(array_length(p_subject_ids, 1), 0) = 0 then
    raise exception 'At least one subject is required';
  end if;

  insert into public.subject_plans (user_id, name, start_date, end_date)
  values (auth.uid(), trim(p_name), p_start_date, p_end_date)
  returning * into v_plan;

  with selected_subjects as (
    select distinct us.id, us.name
    from public.user_subjects us
    where us.user_id = auth.uid()
      and us.is_archived = false
      and us.id = any(p_subject_ids)
  )
  insert into public.subject_plan_items (plan_id, subject_id, subject_name_snapshot, subject_name)
  select v_plan.id, ss.id, ss.name, ss.name
  from selected_subjects ss;

  get diagnostics v_inserted_count = row_count;
  select count(distinct s) into v_expected_count from unnest(p_subject_ids) s;

  if v_inserted_count <> v_expected_count then
    raise exception 'One or more subjects are invalid, archived, or do not belong to the current user';
  end if;

  return v_plan;
end $$;

revoke all on function public.create_subject_plan(text, date, date, uuid[]) from public;
grant execute on function public.create_subject_plan(text, date, date, uuid[]) to authenticated;

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
  and exists (
    select 1
    from public.user_subjects s
    where s.id = subject_plan_items.subject_id
      and s.user_id = auth.uid()
      and s.is_archived = false
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
  and exists (
    select 1
    from public.user_subjects s
    where s.id = subject_plan_items.subject_id
      and s.user_id = auth.uid()
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
