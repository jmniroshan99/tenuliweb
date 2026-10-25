-- InsureDrive v1.5.5 - FCM device notifications + preferences
-- Run AFTER the existing RBAC / Advanced Admin / Vehicle Owner Assignment SQL.
-- Safe to re-run.

begin;

alter table public.device_tokens
  add column if not exists device_id text,
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists idx_device_tokens_last_seen
  on public.device_tokens(last_seen_at desc);

create index if not exists idx_device_tokens_user_device
  on public.device_tokens(user_id, device_id)
  where is_active = true;

-- notification_history originally represented only policy reminders. Make it
-- safely support vehicle/security/general notifications without breaking the
-- existing expiry reminder records.
alter table public.notification_history
  alter column policy_id drop not null,
  alter column reminder_days drop not null;

alter table public.notification_history
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists notification_type text not null default 'insurance_expiry',
  add column if not exists priority text not null default 'normal',
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists read_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notification_history_priority_check'
      and conrelid = 'public.notification_history'::regclass
  ) then
    alter table public.notification_history
      add constraint notification_history_priority_check
      check (priority in ('high', 'normal', 'low'));
  end if;
end $$;

create unique index if not exists uq_notification_history_dedupe_key
  on public.notification_history(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notification_history_type_sent
  on public.notification_history(notification_type, sent_at desc);

create index if not exists idx_notification_history_vehicle_sent
  on public.notification_history(vehicle_id, sent_at desc)
  where vehicle_id is not null;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  insurance_reminders boolean not null default true,
  vehicle_updates boolean not null default true,
  policy_updates boolean not null default true,
  security_alerts boolean not null default true,
  general_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
drop policy if exists "notification_preferences_update_own" on public.notification_preferences;

create policy "notification_preferences_select_own"
on public.notification_preferences for select to authenticated
using (auth.uid() = user_id);

create policy "notification_preferences_insert_own"
on public.notification_preferences for insert to authenticated
with check (auth.uid() = user_id);

create policy "notification_preferences_update_own"
on public.notification_preferences for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert, update on public.notification_preferences to authenticated;

-- Secure token claim/unclaim functions solve a common shared-device case: an
-- FCM registration token may be reused after one InsureDrive user logs out and
-- another signs in on the same phone. The client cannot move another user's
-- RLS-protected row directly, so this SECURITY DEFINER function validates
-- auth.uid() and safely claims only the supplied token for the current user.
create or replace function public.register_device_token(
  p_token text,
  p_platform text,
  p_device_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(p_token), '') is null then
    raise exception 'Device token required';
  end if;
  if p_platform not in ('android', 'ios', 'web') then
    raise exception 'Invalid platform';
  end if;

  delete from public.device_tokens
  where token = p_token and user_id is distinct from uid;

  insert into public.device_tokens (
    user_id, token, platform, device_id, is_active, last_seen_at, updated_at
  ) values (
    uid, p_token, p_platform, nullif(trim(p_device_id), ''), true, now(), now()
  )
  on conflict (token) do update
  set user_id = excluded.user_id,
      platform = excluded.platform,
      device_id = excluded.device_id,
      is_active = true,
      last_seen_at = now(),
      updated_at = now();
end;
$$;

create or replace function public.unregister_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  delete from public.device_tokens
  where user_id = auth.uid() and token = p_token;
end;
$$;

revoke all on function public.register_device_token(text,text,text) from public;
revoke all on function public.unregister_device_token(text) from public;
grant execute on function public.register_device_token(text,text,text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;

-- Device tokens stay strictly user-owned. The server-side Edge Functions use
-- service-role access for delivery, while clients can only maintain their own
-- token rows.
drop policy if exists "tokens_select_own" on public.device_tokens;
drop policy if exists "tokens_insert_own" on public.device_tokens;
drop policy if exists "tokens_update_own" on public.device_tokens;
drop policy if exists "tokens_delete_own" on public.device_tokens;

create policy "tokens_select_own" on public.device_tokens
for select to authenticated using (auth.uid() = user_id);
create policy "tokens_insert_own" on public.device_tokens
for insert to authenticated with check (auth.uid() = user_id);
create policy "tokens_update_own" on public.device_tokens
for update to authenticated using (auth.uid() = user_id)
with check (auth.uid() = user_id);
create policy "tokens_delete_own" on public.device_tokens
for delete to authenticated using (auth.uid() = user_id);

commit;
