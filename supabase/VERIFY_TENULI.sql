-- Read-only structural checks; run after the current combined installer.
select to_regprocedure('repair_private.split_credit(bigint,bigint,bigint)') is not null as simple_billing_upgrade_present;
select to_regnamespace('repair_private') is not null as repair_schema_present,
       to_regprocedure('public.repair_api(text,jsonb,uuid)') is not null as guarded_rpc_present;
select permission_key from public.permissions where category='Repairs' order by permission_key;
select tablename,rowsecurity from pg_tables where schemaname='repair_private' order by tablename;
select grantee,table_name,privilege_type from information_schema.table_privileges
where table_schema='repair_private' and grantee in('anon','authenticated','PUBLIC'); -- Expect zero direct grants.
select name,public,file_size_limit from storage.buckets where id='tenuli-shop-bills'; -- public must be false.
-- Verify roles through actual signed-in accounts in staging, not the owner SQL session.

-- v1.12 service documents: expect true, true and true.
select to_regprocedure('repair_private.service_api(text,jsonb,uuid)') is not null as service_documents_installed,
 to_regclass('repair_private.service_documents') is not null as document_history_present,
 to_regclass('repair_private.handovers') is not null as handovers_present;
select tgname,tgenabled from pg_trigger where tgrelid in('repair_private.service_documents'::regclass,'repair_private.handovers'::regclass,'repair_private.jobs'::regclass) and not tgisinternal;

-- v1.13 grouped estimates/invoices and immutable revised copies.
select to_regprocedure('repair_private.grouped_api(text,jsonb,uuid)') is not null as grouped_billing_installed,
 to_regclass('repair_private.document_copies') is not null as revised_copy_history_present;
select tgname,tgenabled from pg_trigger where tgname in('grouped_document_insert','document_copies_immutable');

-- v1.14 two customer documents: expect true; anon/helper execution must be false.
select to_regprocedure('repair_private.two_document_api(text,jsonb,uuid)') is not null as two_customer_documents_installed;
select has_function_privilege('anon','public.repair_api(text,jsonb,uuid)','execute') as anon_api_must_be_false,
 has_function_privilege('authenticated','repair_private.payment_summary(uuid,uuid,bigint)','execute') as direct_payment_helper_must_be_false,
 has_function_privilege('authenticated','repair_private.two_document_api(text,jsonb,uuid)','execute') as authenticated_guarded_api_must_be_true;
select tgname,tgenabled from pg_trigger where tgname in('payment_purpose','receiving_ack_insert','two_document_insert','two_copy_insert');
select table_name,column_name,is_nullable from information_schema.columns where table_schema='repair_private'
 and (table_name='jobs' and column_name='completion_details' or table_name='payments' and column_name='purpose' or table_name='handovers' and column_name in('completion_document_id','final_document_id'));

-- v1.15: only future customer snapshots receive the modern layout marker.
select to_regprocedure('repair_private.modern_customer_layout()') is not null as modern_customer_pdf_layout_installed;
select tgrelid::regclass as document_table,tgname,tgenabled from pg_trigger
where tgname='zz_modern_customer_layout'; -- Expect three enabled BEFORE INSERT triggers.
select has_function_privilege('anon','repair_private.modern_customer_layout()','EXECUTE') as anon_helper_must_be_false,
 has_function_privilege('authenticated','repair_private.modern_customer_layout()','EXECUTE') as direct_helper_must_be_false;
