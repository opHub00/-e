-- A source formula can have older/newer versions with the same item_key. Limit
-- band cloning to the selected source formula so each band is copied once.
begin;

create or replace function public.clone_scoring_formula_version(p_formula_id uuid,p_version text,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid; source public.scoring_formulas%rowtype; result uuid;
begin
  perform public.assert_assessment_review_access(true); actor:=auth.uid();
  select * into source from public.scoring_formulas where id=p_formula_id;
  if not found then raise exception 'SCORING_FORMULA_NOT_FOUND'; end if;
  if length(trim(p_reason))<3 then raise exception 'REASON_REQUIRED'; end if;
  begin
    insert into public.scoring_formulas(slug,version,name,description,target,scope_key,applicable_scope,status,published_to_users,legal_basis,interpretations,created_by,updated_by)
    values(source.slug,p_version,source.name,source.description,source.target,source.scope_key,source.applicable_scope,'DRAFT',false,source.legal_basis,source.interpretations,actor,actor)
    returning id into result;
  exception when unique_violation then
    perform public.raise_scoring_version_conflict(source.slug,p_version);
  end;
  insert into public.scoring_formula_items(id,formula_id,item_key,label,description,unit,fact,display_order,declared_max_score)
  select gen_random_uuid(),result,item_key,label,description,unit,fact,display_order,declared_max_score
    from public.scoring_formula_items where formula_id=p_formula_id;
  insert into public.scoring_formula_bands(item_id,display_order,min_value,max_value,points,label,note)
  select ni.id,b.display_order,b.min_value,b.max_value,b.points,b.label,b.note
    from public.scoring_formula_bands b
    join public.scoring_formula_items oi on oi.id=b.item_id and oi.formula_id=p_formula_id
    join public.scoring_formula_items ni on ni.formula_id=result and ni.item_key=oi.item_key;
  insert into public.scoring_formula_test_cases(formula_id,case_key,label,inputs,expected_total,expected_breakdown,display_order)
  select result,case_key,label,inputs,expected_total,expected_breakdown,display_order
    from public.scoring_formula_test_cases where formula_id=p_formula_id;
  insert into public.scoring_formula_audit_logs(formula_id,action,actor_user_id,reason,before_snapshot,after_snapshot,formula_revision)
  values(result,'CLONE',actor,p_reason,public.scoring_formula_snapshot(p_formula_id),public.scoring_formula_snapshot(result),0);
  return public.scoring_formula_snapshot(result);
end $$;

commit;
