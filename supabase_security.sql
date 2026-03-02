-- Run this in Supabase SQL Editor.
-- Purpose:
-- 1) Enforce row-level isolation by authenticated user.
-- 2) Enforce valid score range at database level.
-- 3) Keep one record per user+subject+date for safe upsert.

alter table public.daily_subjects enable row level security;

-- Remove old policies if they exist, to make this script idempotent.
drop policy if exists "daily_subjects_select_own" on public.daily_subjects;
drop policy if exists "daily_subjects_insert_own" on public.daily_subjects;
drop policy if exists "daily_subjects_update_own" on public.daily_subjects;
drop policy if exists "daily_subjects_delete_own" on public.daily_subjects;

create policy "daily_subjects_select_own"
on public.daily_subjects
for select
to authenticated
using (auth.uid() = user_id);

create policy "daily_subjects_insert_own"
on public.daily_subjects
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "daily_subjects_update_own"
on public.daily_subjects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "daily_subjects_delete_own"
on public.daily_subjects
for delete
to authenticated
using (auth.uid() = user_id);

-- Ensure score can only be 1..5.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'daily_subjects_score_range_ck'
  ) then
    alter table public.daily_subjects
      add constraint daily_subjects_score_range_ck
      check (score between 1 and 5);
  end if;
end $$;

-- Ensure unique row for upsert on (user_id, subject_name, study_date).
create unique index if not exists daily_subjects_user_subject_date_uk
on public.daily_subjects (user_id, subject_name, study_date);
