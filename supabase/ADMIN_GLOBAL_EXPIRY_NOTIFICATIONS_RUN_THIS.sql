-- InsureDrive v1.5.8 - Administrator global expiry notification upgrade.
-- Safe to re-run through the companion RUN_THIS script.

-- The original schema had UNIQUE(policy_id, reminder_days), which prevents
-- one owner + multiple Administrators from each receiving their own history row.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_history'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE (policy_id, reminder_days)%'
  loop
    execute format('alter table public.notification_history drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.notification_history
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists document_id uuid,
  add column if not exists expiry_date date,
  add column if not exists recipient_scope text not null default 'direct';

-- Support CRITICAL in addition to existing normal/high/low values.
alter table public.notification_history
  drop constraint if exists notification_history_priority_check;
alter table public.notification_history
  add constraint notification_history_priority_check
  check (priority in ('critical', 'high', 'normal', 'low'));

alter table public.notification_history
  drop constraint if exists notification_history_recipient_scope_check;
alter table public.notification_history
  add constraint notification_history_recipient_scope_check
  check (recipient_scope in ('vehicle_owner', 'administrator_global', 'direct'));

-- Recipient-aware dedupe is authoritative. Existing dedupe index remains valid.
create unique index if not exists uq_notification_history_dedupe_key
  on public.notification_history(dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notification_history_user_unread
  on public.notification_history(user_id, sent_at desc)
  where read_at is null;

create index if not exists idx_notification_history_scope_sent
  on public.notification_history(recipient_scope, sent_at desc);

create index if not exists idx_notification_history_document
  on public.notification_history(document_id)
  where document_id is not null;

create index if not exists idx_notification_history_owner
  on public.notification_history(owner_id, sent_at desc)
  where owner_id is not null;

-- An Administrator must always be able to read/acknowledge their own global
-- expiry records even if a custom permission override removes view_all_notifications.
drop policy if exists "history_select_by_role" on public.notification_history;
create policy "history_select_by_role" on public.notification_history
for select to authenticated using (
  public.current_user_is_active()
  and (
    (
      auth.uid() = user_id
      and (
        public.current_user_role() = 'administrator'
        or public.has_permission('view_own_notifications')
      )
    )
    or public.has_permission('view_all_notifications')
  )
);

drop policy if exists "history_update_own_read" on public.notification_history;
create policy "history_update_own_read" on public.notification_history
for update to authenticated using (
  public.current_user_is_active()
  and auth.uid() = user_id
  and (
    public.current_user_role() = 'administrator'
    or public.has_permission('view_own_notifications')
  )
) with check (
  public.current_user_is_active()
  and auth.uid() = user_id
  and (
    public.current_user_role() = 'administrator'
    or public.has_permission('view_own_notifications')
  )
);

revoke update on table public.notification_history from authenticated;
grant update (read_at) on table public.notification_history to authenticated;
