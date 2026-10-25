-- v1.18.1: select the blue letterhead for future issues/revisions only.
-- Requires the v1.18 operations-bill upgrade. No historical snapshot is rewritten.
begin;
do $$ begin
 if to_regprocedure('repair_private.freeze_current_brand()') is null then
  raise exception 'Install TENULI_OPERATIONS_BILL_UPGRADE.sql first, or use current ENABLE_AUTOMART.sql';
 end if;
end $$;
create or replace function repair_private.freeze_blue_letterhead() returns trigger
language plpgsql set search_path='' as $$
begin
 new.snapshot:=new.snapshot||jsonb_build_object('letterhead_style','blue-v1');
 return new;
end $$;
revoke all on function repair_private.freeze_blue_letterhead() from public,anon,authenticated;
drop trigger if exists zzz_blue_letterhead on repair_private.service_documents;
create trigger zzz_blue_letterhead before insert on repair_private.service_documents for each row execute function repair_private.freeze_blue_letterhead();
drop trigger if exists zzz_blue_letterhead on repair_private.documents;
create trigger zzz_blue_letterhead before insert on repair_private.documents for each row execute function repair_private.freeze_blue_letterhead();
drop trigger if exists zzz_blue_letterhead on repair_private.document_copies;
create trigger zzz_blue_letterhead before insert on repair_private.document_copies for each row execute function repair_private.freeze_blue_letterhead();
drop trigger if exists zzz_blue_letterhead on repair_private.payments;
create trigger zzz_blue_letterhead before insert on repair_private.payments for each row execute function repair_private.freeze_blue_letterhead();
drop trigger if exists zzz_blue_letterhead on public.rental_invoices;
create trigger zzz_blue_letterhead before insert on public.rental_invoices for each row execute function repair_private.freeze_blue_letterhead();
notify pgrst,'reload schema';
commit;
