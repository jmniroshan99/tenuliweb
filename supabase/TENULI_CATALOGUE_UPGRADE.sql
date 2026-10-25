-- Tenuli Auto Care v1.19: optional shared custom catalogue.
-- The 600 built-in suggestions work without this upgrade. Run this only on the
-- existing application database to enable an administrator's explicit Save to
-- shared catalogue action. Jobs, prices, payments and issued documents are untouched.
begin;
do $$ begin
 if to_regprocedure('repair_private.can(text)') is null then
  raise exception 'Install the existing Tenuli repair module first';
 end if;
end $$;

create table if not exists repair_private.custom_catalogue (
 id uuid primary key default gen_random_uuid(),
 category text not null check(category in('Replacement Items','Removal & Refitting Items','Repair Items','Paint Items','Miscellaneous Items','Other Charges')),
 description text not null check(length(description) between 1 and 300),
 description_key text generated always as (lower(regexp_replace(btrim(description),'[[:space:]]+',' ','g'))) stored,
 unit text not null default 'item' check(length(unit) between 1 and 40),
 active boolean not null default true,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 unique(category,description_key)
);
alter table repair_private.custom_catalogue enable row level security;
revoke all on repair_private.custom_catalogue from public,anon,authenticated;

create or replace function repair_private.catalogue_api(action text,p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare entry repair_private.custom_catalogue; label text; section text; item_unit text; inserted boolean:=false;
begin
 if not (repair_private.can('view_repairs') or repair_private.can('manage_repairs') or repair_private.can('view_repair_billing') or repair_private.can('manage_repair_payments')) then
  raise exception 'Repair access denied' using errcode='42501';
 end if;
 if action='list' then
  return jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'category',c.category,'description',c.description,'aliases','[]'::jsonb,
   'unit',c.unit,'active',c.active,'version',c.version
  ) order by c.description),'[]'::jsonb) from repair_private.custom_catalogue c where c.active));
 elsif action='add' then
  if public.current_user_role()<>'administrator' or not repair_private.can('manage_system_settings') then
   raise exception 'Administrator settings permission required' using errcode='42501';
  end if;
  if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'description') is distinct from 'string'
   or jsonb_typeof(p->'category') is distinct from 'string'
   or (p ? 'unit' and jsonb_typeof(p->'unit') is distinct from 'string') then
   raise exception 'Choose a section and enter a description';
  end if;
  label:=regexp_replace(btrim(p->>'description'),'[[:space:]]+',' ','g');
  section:=p->>'category'; item_unit:=btrim(coalesce(p->>'unit','item'));
  if length(label) not between 1 and 300 or length(item_unit) not between 1 and 40
   or section not in('Replacement Items','Removal & Refitting Items','Repair Items','Paint Items','Miscellaneous Items','Other Charges') then
   raise exception 'Invalid catalogue description, section or unit';
  end if;
  -- No prices, customer/job data, aliases or arbitrary input fields are stored.
  insert into repair_private.custom_catalogue(category,description,unit,created_by)
   values(section,label,item_unit,auth.uid()) on conflict(category,description_key) do nothing returning * into entry;
  inserted:=found;
  if not inserted then
   select * into strict entry from repair_private.custom_catalogue
    where category=section and description_key=lower(label);
  else
   insert into public.audit_logs(actor_user_id,action,entity_type,entity_id,metadata)
    values(auth.uid(),'repair_catalogue_add','repair_catalogue',entry.id::text,jsonb_build_object('category',section));
  end if;
  return jsonb_build_object('id',entry.id,'category',entry.category,'description',entry.description,
   'aliases','[]'::jsonb,'unit',entry.unit,'active',entry.active,'version',entry.version);
 end if;
 raise exception 'Unknown catalogue action';
end $$;
revoke all on function repair_private.catalogue_api(text,jsonb) from public,anon,authenticated;
grant execute on function repair_private.catalogue_api(text,jsonb) to authenticated;

create or replace function public.repair_catalogue_api(p_action text,p_payload jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select repair_private.catalogue_api(p_action,p_payload);
$$;
revoke all on function public.repair_catalogue_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.repair_catalogue_api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
