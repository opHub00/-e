-- Fix: the read model declared a variable named like an audit column (actor_role), which made the
-- audit subquery ambiguous (42702). Same behaviour, prefixed variable. Grants are kept by CREATE OR REPLACE.
begin;

create or replace function public.load_assessment_listing_bindings()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_role text;
begin
  v_role := public.assert_assessment_review_access(false);
  return jsonb_build_object(
    'role', v_role,
    'announcements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'announcementId', a.id, 'title', a.title,
        'activeRuleSetId', s.id, 'activeVersion', s.version, 'sourceStatus', s.source_status,
        'listingIds', to_jsonb(coalesce(public.assessment_announcement_listing_ids(a.id), array[]::text[]))
      ) order by a.title)
      from public.announcements a join public.assessment_rule_sets s on s.announcement_id = a.id
      where s.is_active and s.is_public and s.approved_at is not null and a.status = 'PUBLISHED'), '[]'::jsonb),
    'bindings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'listingId', b.listing_id, 'announcementId', b.announcement_id, 'announcementTitle', a.title,
        'boundRuleSetId', b.bound_rule_set_id,
        'activeRuleSetId', (select s.id from public.assessment_rule_sets s where s.announcement_id = b.announcement_id and s.is_active),
        'revision', b.revision, 'updatedAt', b.updated_at
      ) order by b.listing_id)
      from public.announcement_listing_bindings b join public.announcements a on a.id = b.announcement_id), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(row_to_json(x)::jsonb order by x.id desc) from (
        select id, action, actor_role, listing_id, previous_announcement_id, previous_rule_set_id,
               new_announcement_id, new_rule_set_id, previous_revision, new_revision, reason, created_at
          from public.announcement_listing_binding_audit_log order by id desc limit 50) x), '[]'::jsonb));
end $$;

notify pgrst, 'reload schema';
commit;
