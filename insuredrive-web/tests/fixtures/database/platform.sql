-- SYNTHETIC LOCAL TEST/DEMO platform. Never apply this file to a real Supabase project.
create schema auth;
create role anon;
create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid; $$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
create type public.app_role as enum('administrator','insurance_officer','vehicle_owner');
create table public.profiles(id uuid primary key references auth.users,full_name text,email text,phone text default '',role app_role,account_status text default 'active',is_active boolean default true);
create table public.permissions(permission_key text primary key,name text,category text,description text,admin_only boolean default false);
create table public.role_permissions(role app_role,permission_key text references permissions,allowed boolean,primary key(role,permission_key));
create table public.user_permissions(user_id uuid,permission_key text,allowed boolean,primary key(user_id,permission_key));
create table public.vehicles(id uuid primary key,user_id uuid references auth.users,owner_name text,registration_number text,make text,model text,vehicle_type text default 'Car',is_active boolean default true,manufacture_year integer default 2022,province text default 'Western',district text default 'Colombo');
create table public.audit_logs(id uuid default gen_random_uuid(),actor_user_id uuid,action text,entity_type text,entity_id text,metadata jsonb,created_at timestamptz default now());
create function public.current_user_role() returns app_role language sql stable security definer as $$ select role from public.profiles where id=auth.uid(); $$;
create function public.current_user_is_active() returns boolean language sql stable security definer as $$ select coalesce((select is_active and account_status='active' from public.profiles where id=auth.uid()),false); $$;
create function public.has_permission(target_permission_key text) returns boolean language sql stable security definer as $$ select public.current_user_is_active() and coalesce((select coalesce(u.allowed,r.allowed,false) from public.permissions p left join public.role_permissions r on r.permission_key=p.permission_key and r.role=public.current_user_role() left join public.user_permissions u on u.permission_key=p.permission_key and u.user_id=auth.uid() where p.permission_key=target_permission_key and(not p.admin_only or public.current_user_role()='administrator')),false); $$;
create function public.get_effective_permissions() returns table(permission_key text) language sql stable security definer as $$ select p.permission_key from public.permissions p where public.has_permission(p.permission_key); $$;
create function public.permission_allowed_for_role(target_role app_role,target_permission_key text) returns boolean language sql immutable as $$ select target_role='administrator'; $$;
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004');
insert into public.profiles(id,full_name,email,role) values
 ('00000000-0000-4000-8000-000000000001','Demo Administrator','demo@example.invalid','administrator'),
 ('00000000-0000-4000-8000-000000000002','Demo Owner A','owner-a@example.invalid','vehicle_owner'),
 ('00000000-0000-4000-8000-000000000003','Demo Owner B','owner-b@example.invalid','vehicle_owner'),
 ('00000000-0000-4000-8000-000000000004','Demo Officer','officer@example.invalid','insurance_officer');
insert into public.vehicles(id,user_id,owner_name,registration_number,make,model) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','Demo Owner A','DEMO-001','Toyota','Aqua'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Demo Owner A','DEMO-002','Suzuki','Wagon R'),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000003','Demo Owner B','DEMO-003','Toyota','KDH');
insert into public.permissions values('manage_system_settings','Settings','System','',true);
insert into public.role_permissions values('administrator','manage_system_settings',true);
alter table public.vehicles enable row level security;
create policy vehicles_read on public.vehicles for select to authenticated using(public.current_user_is_active() and (public.current_user_role() in ('administrator','insurance_officer') or user_id=auth.uid()));
grant select on public.vehicles,public.profiles to authenticated;
