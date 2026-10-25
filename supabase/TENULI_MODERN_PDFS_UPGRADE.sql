-- Tenuli 1.15: choose the modern A4 renderer for future customer snapshots only.
-- No UPDATE of history, finance changes, new tables or permission changes.
begin;
do $$ begin
 if to_regprocedure('repair_private.two_document_api(text,jsonb,uuid)') is null then raise exception 'Install the two-document workflow first, or run the current ENABLE_AUTOMART.sql';end if;
end $$;
create or replace function repair_private.modern_customer_layout() returns trigger language plpgsql set search_path='' as $$
begin
 if new.snapshot->>'template_version' in('receiving-advance-v1','final-bill-v1') then
  new.snapshot:=new.snapshot||jsonb_build_object('layout_version','modern-a4-v1');
 end if;
 return new;
end $$;
revoke all on function repair_private.modern_customer_layout() from public,anon,authenticated;
-- PostgreSQL runs same-kind triggers alphabetically; enrich only after the existing snapshot triggers.
drop trigger if exists zz_modern_customer_layout on repair_private.service_documents;
create trigger zz_modern_customer_layout before insert on repair_private.service_documents for each row execute function repair_private.modern_customer_layout();
drop trigger if exists zz_modern_customer_layout on repair_private.documents;
create trigger zz_modern_customer_layout before insert on repair_private.documents for each row execute function repair_private.modern_customer_layout();
drop trigger if exists zz_modern_customer_layout on repair_private.document_copies;
create trigger zz_modern_customer_layout before insert on repair_private.document_copies for each row execute function repair_private.modern_customer_layout();
notify pgrst,'reload schema';
commit;
