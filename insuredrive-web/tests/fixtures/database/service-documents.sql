-- Tenuli Auto Care 1.12: immutable receiving/completion notes and explicit handover.
-- Apply after TENULI_SIMPLE_BILLING_UPGRADE.sql, or use ENABLE_AUTOMART.sql.
begin;
alter table repair_private.jobs add column if not exists received_at timestamptz;
alter table repair_private.jobs add column if not exists completed_at timestamptz;
create sequence if not exists repair_private.service_note_no;
create table if not exists repair_private.service_documents(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references repair_private.jobs(id),
 kind text not null check(kind in('receiving','completion')),series_number text not null,revision integer not null check(revision>0),
 number text not null unique,parent_id uuid references repair_private.service_documents(id),job_revision integer not null,
 snapshot jsonb not null,created_at timestamptz not null default now(),created_by uuid not null references auth.users(id),
 unique(job_id,kind,revision)
);
create table if not exists repair_private.handovers(
 job_id uuid primary key references repair_private.jobs(id),completion_document_id uuid not null references repair_private.service_documents(id),
 handed_over_at timestamptz not null default now(),recipient text not null,notes text not null default '',created_by uuid not null references auth.users(id)
);
alter table repair_private.service_documents enable row level security;
alter table repair_private.handovers enable row level security;
revoke all on repair_private.service_documents,repair_private.handovers,repair_private.service_note_no from public,anon,authenticated;
create or replace function repair_private.service_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Issued documents and handover events are immutable. Issue a numbered correction.';end $$;
drop trigger if exists service_documents_immutable on repair_private.service_documents;
create trigger service_documents_immutable before update or delete on repair_private.service_documents for each row execute function repair_private.service_immutable();
drop trigger if exists handovers_immutable on repair_private.handovers;
create trigger handovers_immutable before update or delete on repair_private.handovers for each row execute function repair_private.service_immutable();
create or replace function repair_private.service_job_state() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select 1 from repair_private.handovers where job_id=old.id) and (new.status is distinct from old.status or new.info is distinct from old.info or new.lines is distinct from old.lines) then
  raise exception 'Vehicle already handed over. Create a new job for further repairs.';
 end if;
 if new.status is distinct from old.status then
  new.completed_at:=case when new.status='completed' then now() else null end;
 end if;
 return new;
end $$;
drop trigger if exists service_job_state on repair_private.jobs;
create trigger service_job_state before update on repair_private.jobs for each row execute function repair_private.service_job_state();

create or replace function repair_private.service_api(action text,p jsonb,request_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
<<service_body>>
declare
 uid uuid:=auth.uid();billflag boolean:=repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments');
 j repair_private.jobs;previous repair_private.service_documents;d repair_private.service_documents;inv repair_private.documents;
 prior repair_private.requests;handover repair_private.handovers;
 result jsonb;content jsonb:='{}';info jsonb:='{}';snap jsonb;billing jsonb:=null;kind_name text;series text;k text;v text;
 reason text:=trim(coalesce(p->>'reason',''));received timestamptz;completed timestamptz;revision_no integer;paid bigint;credits bigint;
begin
 if not (repair_private.can('view_repairs') or repair_private.can('manage_repairs') or billflag) then raise exception 'Repair access denied';end if;
 if action='list' then
  result:=repair_private.api('list',p,null);
  return result||jsonb_build_object('service_documents_enabled',true,
   'service_documents',(select coalesce(jsonb_agg(to_jsonb(s) order by s.created_at desc,s.revision desc),'[]') from repair_private.service_documents s where billflag or s.snapshot->'billing' is null or s.snapshot->'billing'='null'::jsonb),
   'handovers',(select coalesce(jsonb_agg(to_jsonb(h)),'[]') from repair_private.handovers h),
   'invoiced_jobs',(select coalesce(jsonb_agg(job_id),'[]') from repair_private.documents where kind='invoice' and status='issued'),
   'service_events',(select coalesce(jsonb_agg(to_jsonb(e) order by created_at desc),'[]') from repair_private.events e where e.action in('receiving_create','receiving_issue','completion_issue','handover')));
 elsif action='service_document' then
  select * into strict d from repair_private.service_documents where id=(p->>'id')::uuid;
  if d.snapshot->'billing' is not null and d.snapshot->'billing'<>'null'::jsonb and not billflag then raise exception 'Billing access denied';end if;
  return to_jsonb(d);
 end if;
 if action not in('receiving_create','receiving_issue','completion_issue','handover') then raise exception 'Unknown document action';end if;
 if not repair_private.can('manage_repairs') then raise exception 'Manage repairs permission required';end if;
 if request_id is null then raise exception 'Request ID required';end if;
 if length(reason)>1000 then raise exception 'Correction reason is too long (maximum 1000 characters)';end if;
 perform pg_advisory_xact_lock(hashtextextended('repair:'||uid::text||request_id::text,0));
 select * into prior from repair_private.requests r where r.actor=uid and r.request_id=service_api.request_id;
 if found then
  if prior.action<>service_api.action or prior.payload_hash<>md5(p::text) then raise exception 'Request key reused with different data';end if;
  if prior.response->'snapshot'->'billing' is not null and prior.response->'snapshot'->'billing'<>'null'::jsonb and not billflag then raise exception 'Billing access denied';end if;
  return prior.response;
 end if;
 -- Same lock as billing: capture one consistent invoice/payment/credit balance.
 perform pg_advisory_xact_lock(hashtextextended('tenuli-repair-finance',0));
 if action='receiving_create' then
  foreach k in array array['customer_name','phone','registration','make_model'] loop
   v:=trim(coalesce(p->>k,''));if length(v)>200 then raise exception '% is too long (maximum 200 characters)',k;end if;
   info:=info||jsonb_build_object(k,v);
  end loop;
  if info->>'customer_name'='' or info->>'registration'='' then raise exception 'Customer name and vehicle registration are required';end if;
  insert into repair_private.jobs(info,lines,created_by) values(info||'{"expected_customer_minor":0,"expected_insurer_minor":0}',
   repair_private.calc(jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'description',left(coalesce(p->>'requested_work','Inspection / diagnosis'),300),'category','Repair Items','quantity',1,'unit','job','unit_minor',null,'discount_minor',0,'tax_bps',0)))->'lines',uid) returning * into j;
 else
  select * into strict j from repair_private.jobs where id=(p->>'job_id')::uuid for update;
  if j.version is distinct from (p->>'version')::int then raise exception 'Job changed; reload and try again';end if;
 end if;
 kind_name:=case when action in('receiving_create','receiving_issue') then 'receiving' else 'completion' end;
 select * into previous from repair_private.service_documents where job_id=j.id and kind=kind_name order by revision desc limit 1;
 if coalesce((p->>'document_revision')::int,0)<>coalesce(previous.revision,0) then raise exception 'Document changed; reload the latest revision';end if;
 if previous.id is not null and reason='' and action<>'handover' then raise exception 'A correction reason is required';end if;
 if j.status='cancelled' then raise exception 'Cancelled jobs cannot issue new documents';end if;
 select * into handover from repair_private.handovers where job_id=j.id;
 if kind_name='completion' then
  if j.status<>'completed' then raise exception 'Complete the repair job before issuing a completion note or recording handover';end if;
  completed:=coalesce(j.completed_at,(select max(created_at) from repair_private.events where job_id=j.id and events.action='complete'),nullif(p->>'completed_at','')::timestamptz);
  if completed is null or completed>now() then raise exception 'Enter the actual completion date and time for this historical job';end if;
  select * into inv from repair_private.documents where job_id=j.id and kind='invoice' and status='issued';
  if inv.id is not null then
   if not billflag then raise exception 'Billing access is required to issue or hand over a job with an invoice';end if;
   paid:=repair_private.paid(j.id);
   select coalesce(sum(total_minor),0) into credits from repair_private.documents where parent_id=inv.id and kind='credit' and status='issued';
   billing:=jsonb_build_object('invoice_number',inv.number,'total_minor',inv.total_minor,'paid_minor',paid,'credit_minor',credits,'balance_minor',inv.total_minor-credits-paid,'as_of',now());
  end if;
 end if;
 if action='handover' then
  if coalesce(p->>'confirm','')<>'true' then raise exception 'Confirm the vehicle has actually been returned';end if;
  if handover.job_id is not null then raise exception 'Vehicle handover already recorded';end if;
  if previous.id is null or previous.job_revision<>j.revision or (previous.snapshot->>'completed_at')::timestamptz is distinct from completed then raise exception 'Issue a current completion note before recording handover';end if;
  v:=trim(coalesce(p->>'recipient',''));
  if v='' or length(v)>200 or length(coalesce(p->>'handover_notes',''))>1000 then raise exception 'Enter recipient (up to 200 characters) and notes up to 1000 characters';end if;
  if p ? 'handed_over_at' then raise exception 'Handover time is recorded by the server at confirmation';end if;
  insert into repair_private.handovers(job_id,completion_document_id,recipient,notes,created_by) values(j.id,previous.id,v,coalesce(p->>'handover_notes',''),uid) returning * into handover;
  content:=previous.snapshot->'content';reason:='Vehicle returned to '||v;
 else
  foreach k in array case when kind_name='receiving' then array['reported_problem','requested_work','expected_date','odometer','fuel_level','damage','condition','accessories','notes'] else array['work_performed','parts_replaced','checks','recommendations','warranty','notes'] end loop
   v:=trim(coalesce(p->>k,''));
   if length(v)>(case when k in('expected_date','odometer','fuel_level') then 100 else 2000 end) then raise exception '% is too long',k;end if;
   content:=content||jsonb_build_object(k,v);
  end loop;
  if kind_name='receiving' then
   if content->>'reported_problem'='' or content->>'requested_work'='' then raise exception 'Reported problem and requested work are required';end if;
   received:=coalesce(nullif(p->>'received_at','')::timestamptz,j.received_at,now());
   if received>now() or received>coalesce(j.completed_at,(select max(created_at) from repair_private.events where job_id=j.id and events.action='complete'),'infinity') or received>coalesce(handover.handed_over_at,'infinity') then raise exception 'Received time must be in the past and before completion or handover';end if;
   if nullif(content->>'odometer','') is not null and (content->>'odometer')::numeric<0 then raise exception 'Odometer cannot be negative';end if;
   if nullif(content->>'expected_date','') is not null and (content->>'expected_date')::date<(received at time zone 'Asia/Colombo')::date then raise exception 'Expected completion must be on or after arrival';end if;
  elsif content->>'work_performed'='' then raise exception 'Work performed is required';end if;
 end if;
 if completed<j.received_at then raise exception 'Completion cannot be before arrival';end if;
 -- Assigning a job number is not customer approval. No approval/payment fields are modified.
 update repair_private.jobs set job_number=coalesce(job_number,'TAC-JOB-'||nextval('repair_private.job_no')),
  received_at=coalesce(received,received_at),completed_at=coalesce(completed,completed_at),version=version+1,updated_at=now() where id=j.id returning * into j;
 series:=coalesce(previous.series_number,case when kind_name='receiving' then 'TAC-RN-' else 'TAC-CN-' end||nextval('repair_private.service_note_no'));
 revision_no:=coalesce(previous.revision,0)+1;
 info:='{}';foreach k in array array['customer_name','phone','registration','make_model'] loop
  v:=case when action='handover' then previous.snapshot->'info'->>k else coalesce(p->>k,j.info->>k,'') end;
  if length(v)>200 then raise exception '% is too long (maximum 200 characters)',k;end if;
  if k in('customer_name','registration') and trim(v)='' then raise exception 'Customer name and registration are required';end if;
  info:=info||jsonb_build_object(k,v);
 end loop;
 snap:=jsonb_build_object('business',(select data from repair_private.business),'info',info,'job_number',j.job_number,'content',content,
  'received_at',j.received_at,'completed_at',case when kind_name='completion' then completed end,'billing',billing,'correction_reason',reason,
  'handover',case when kind_name='completion' and handover.job_id is not null then jsonb_build_object('handed_over_at',handover.handed_over_at,'recipient',handover.recipient,'notes',handover.notes) end);
 insert into repair_private.service_documents(job_id,kind,series_number,revision,number,parent_id,job_revision,snapshot,created_by)
 values(j.id,kind_name,series,revision_no,series||'-R'||revision_no,previous.id,j.revision,snap,uid) returning * into d;
 result:=to_jsonb(d);
 insert into repair_private.events(job_id,actor,action,reason) values(j.id,uid,action,case when reason='' then d.number else reason end);
 insert into repair_private.requests values(uid,request_id,action,md5(p::text),result);
 return result;
end $$;
revoke all on function repair_private.service_immutable(),repair_private.service_job_state(),repair_private.service_api(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function repair_private.service_api(text,jsonb,uuid) to authenticated;
create or replace function public.repair_api(p_action text,p_payload jsonb default '{}',p_request_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$
 select case when p_action in('list','service_document','receiving_create','receiving_issue','completion_issue','handover') then repair_private.service_api(p_action,p_payload,p_request_id) else repair_private.api(p_action,p_payload,p_request_id) end;
$$;
revoke all on function public.repair_api(text,jsonb,uuid) from public,anon;
grant execute on function public.repair_api(text,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
