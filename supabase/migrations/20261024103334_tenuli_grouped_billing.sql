-- Tenuli Auto Care 1.13: grouped customer documents and immutable layout revisions.
-- Apply after TENULI_SERVICE_DOCUMENTS_UPGRADE.sql, or use ENABLE_AUTOMART.sql.
begin;
do $$ begin
 if to_regprocedure('repair_private.service_api(text,jsonb,uuid)') is null then
  raise exception 'Install the service-document update first, or run ENABLE_AUTOMART.sql';
 end if;
end $$;
create or replace function repair_private.work_section(value text) returns text language sql immutable set search_path='' as $$
 select case lower(trim(coalesce(value,'')))
 when 'replacement items' then 'Replacement Items'
 when 'remove & refit items' then 'Removal & Refitting Items'
 when 'removal & refitting items' then 'Removal & Refitting Items'
 when 'remove and refixed items' then 'Removal & Refitting Items'
 when 'paint items' then 'Paint Items' else 'Repair Items' end;
$$;
create or replace function repair_private.grouped_snapshot(s jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_set(s||jsonb_build_object('template_version','grouped-v1'),'{calculation,lines}',
  coalesce((select jsonb_agg(x||jsonb_build_object('category',repair_private.work_section(x->>'category')) order by ord)
   from jsonb_array_elements(s->'calculation'->'lines') with ordinality as a(x,ord) where not coalesce((x->>'excluded')::boolean,false)),'[]'::jsonb));
$$;
create or replace function repair_private.grouped_document_insert() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind in('estimate','invoice') then
  new.snapshot:=repair_private.grouped_snapshot(new.snapshot);
  if new.kind='invoice' then
   new.snapshot:=new.snapshot||jsonb_build_object('settlement',jsonb_build_object('paid_minor',repair_private.paid(new.job_id),'credit_minor',0,'balance_minor',new.total_minor-repair_private.paid(new.job_id),'as_of',now()));
  end if;
 end if;
 return new;
end $$;
drop trigger if exists grouped_document_insert on repair_private.documents;
create trigger grouped_document_insert before insert on repair_private.documents for each row execute function repair_private.grouped_document_insert();
create table if not exists repair_private.document_copies(
 id uuid primary key default gen_random_uuid(),source_document_id uuid not null references repair_private.documents(id),
 job_id uuid not null references repair_private.jobs(id),number text not null unique,kind text not null check(kind in('estimate','invoice')),
 copy_revision integer not null check(copy_revision>0),snapshot jsonb not null,total_minor bigint not null,
 created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),unique(source_document_id,copy_revision)
);
alter table repair_private.document_copies enable row level security;
revoke all on repair_private.document_copies from public,anon,authenticated;
create index if not exists repair_document_copies_job on repair_private.document_copies(job_id);
drop trigger if exists document_copies_immutable on repair_private.document_copies;
create trigger document_copies_immutable before update or delete on repair_private.document_copies for each row execute function repair_private.service_immutable();
create or replace function repair_private.grouped_api(action text,p jsonb,request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid();billflag boolean:=repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments');
 d repair_private.documents;c repair_private.document_copies;prior repair_private.requests;result jsonb;s jsonb;
 rev int;paid bigint;credits bigint;reason text:=trim(coalesce(p->>'reason',''));
begin
 if not (repair_private.can('view_repairs') or repair_private.can('manage_repairs') or billflag) then raise exception 'Repair access denied';end if;
 if action='list' then
  return repair_private.service_api('list',p,null)||jsonb_build_object('grouped_billing',true,'document_copies',
   (select coalesce(jsonb_agg(to_jsonb(v)||jsonb_build_object('status',original.status,'is_layout_copy',true) order by v.created_at desc),'[]')
    from repair_private.document_copies v join repair_private.documents original on original.id=v.source_document_id where v.kind='estimate' or billflag));
 elsif action='document_copy' then
  select * into strict c from repair_private.document_copies where id=(p->>'id')::uuid;
  if c.kind='invoice' and not billflag then raise exception 'Billing access denied';end if;
  return to_jsonb(c)||jsonb_build_object('is_layout_copy',true,'status',(select status from repair_private.documents where id=c.source_document_id));
 elsif action<>'document_reissue' then raise exception 'Unknown grouped-document action';end if;
 select * into strict d from repair_private.documents where id=(p->>'document_id')::uuid and kind in('estimate','invoice');
 if not repair_private.can(case when d.kind='invoice' then 'manage_repair_payments' else 'manage_repairs' end) then raise exception 'Document revision permission denied';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 perform pg_advisory_xact_lock(hashtextextended('repair:'||uid::text||request_id::text,0));
 select * into prior from repair_private.requests r where r.actor=uid and r.request_id=grouped_api.request_id;
 if found then
  if prior.action<>grouped_api.action or prior.payload_hash<>md5(p::text) then raise exception 'Request key reused with different data';end if;
  return prior.response;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
 select * into strict d from repair_private.documents where id=d.id for update;
 if d.status<>'issued' then raise exception 'A void document cannot be reissued';end if;
 if length(reason) not between 1 and 1000 then raise exception 'Enter a revision reason (maximum 1000 characters)';end if;
 select coalesce(max(copy_revision),0) into rev from repair_private.document_copies where source_document_id=d.id;
 if rev is distinct from (p->>'copy_revision')::int then raise exception 'Document changed; reload the revision history';end if;
 s:=repair_private.grouped_snapshot(d.snapshot)||jsonb_build_object('original_number',d.number,'original_issued_at',d.created_at,'copy_revision',rev+1,'correction_reason',reason);
 if d.kind='invoice' then
  paid:=repair_private.paid(d.job_id);
  select coalesce(sum(total_minor),0) into credits from repair_private.documents where parent_id=d.id and kind='credit' and status='issued';
  s:=s||jsonb_build_object('settlement',jsonb_build_object('paid_minor',paid,'credit_minor',credits,'balance_minor',d.total_minor-credits-paid,'as_of',now()));
 end if;
 insert into repair_private.document_copies(source_document_id,job_id,number,kind,copy_revision,snapshot,total_minor,created_by)
 values(d.id,d.job_id,d.number||'-COPY-R'||(rev+1),d.kind,rev+1,s,d.total_minor,uid) returning * into c;
 result:=to_jsonb(c)||jsonb_build_object('status',d.status,'is_layout_copy',true);
 insert into repair_private.events(job_id,actor,action,reason) values(d.job_id,uid,'document_reissue',reason);
 insert into repair_private.requests values(uid,request_id,action,md5(p::text),result);
 return result;
end $$;
revoke all on function repair_private.work_section(text),repair_private.grouped_snapshot(jsonb),repair_private.grouped_document_insert(),repair_private.grouped_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function repair_private.grouped_api(text,jsonb,uuid) to authenticated;
create or replace function public.repair_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select case when p_action in('list','document_copy','document_reissue') then repair_private.grouped_api(p_action,p_payload,p_request_id)
 when p_action in('service_document','receiving_create','receiving_issue','completion_issue','handover') then repair_private.service_api(p_action,p_payload,p_request_id)
 else repair_private.api(p_action,p_payload,p_request_id) end;
$$;
revoke all on function public.repair_api(text,jsonb,uuid) from public,anon;
grant execute on function public.repair_api(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
