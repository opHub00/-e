-- Preserve RAG lineage: service_role only gets the operations used by the
-- server-side metadata writer and reader. In particular, do not permit
-- TRUNCATE (which bypasses DELETE triggers) or direct history modification.
begin;

revoke all on public.product_v3_rag_index_metadata,
  public.product_v3_rag_index_audit_log from service_role;
grant select, insert, update on public.product_v3_rag_index_metadata to service_role;
grant select, insert on public.product_v3_rag_index_audit_log to service_role;

revoke all on sequence public.product_v3_rag_index_audit_log_id_seq from service_role;
grant usage, select on sequence public.product_v3_rag_index_audit_log_id_seq to service_role;

commit;
