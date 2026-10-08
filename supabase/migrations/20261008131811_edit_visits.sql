-- Editing a saved visit: its date, notes, who was there, and every dish.
--
-- One call, one transaction, so a half-finished edit is never left behind.
-- SECURITY INVOKER, so the same row-level security as create_visit decides:
-- only whoever logged a visit can change it, and only with people from their
-- own circle.
--
-- p_dishes is the whole list as it should be afterwards. Each element carries
-- the dish's id: an id already on this visit updates that dish, a new id adds
-- one, and dishes on the visit that aren't in the list are removed.
-- keep_photo says whether the dish keeps the photo it has. The app clears
-- the photo files of removed dishes itself, as deleteVisit does, and uploads
-- new or replacement photos after this returns.

create function public.update_visit(
  p_id uuid,
  p_visited_at timestamptz,
  p_person_ids uuid[],
  p_dishes jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_dishes constant jsonb := coalesce(p_dishes, '[]'::jsonb);
  v_people uuid[];
begin
  update visits
  set visited_at = p_visited_at, notes = nullif(trim(p_notes), '')
  where id = p_id and owner_id = auth.uid();

  if not found then
    raise exception 'You can only edit visits you logged';
  end if;

  delete from dishes t
  where t.visit_id = p_id
    and not exists (select 1 from jsonb_array_elements(v_dishes) d where (d ->> 'id')::uuid = t.id);

  update dishes t
  set person_id = (d ->> 'person_id')::uuid,
      name = trim(d ->> 'name'),
      rating = (d ->> 'rating')::smallint,
      would_order_again = coalesce((d ->> 'would_order_again')::boolean, false),
      notes = nullif(trim(d ->> 'notes'), ''),
      photo_path = case when coalesce((d ->> 'keep_photo')::boolean, false) then t.photo_path end
  from jsonb_array_elements(v_dishes) d
  where t.visit_id = p_id and t.id = (d ->> 'id')::uuid;

  -- A new dish's id must be new everywhere: one from another visit fails on
  -- the primary key rather than being moved here.
  insert into dishes (id, visit_id, person_id, name, rating, would_order_again, notes)
  select coalesce((d ->> 'id')::uuid, gen_random_uuid()),
         p_id,
         (d ->> 'person_id')::uuid,
         trim(d ->> 'name'),
         (d ->> 'rating')::smallint,
         coalesce((d ->> 'would_order_again')::boolean, false),
         nullif(trim(d ->> 'notes'), '')
  from jsonb_array_elements(v_dishes) d
  where not exists (select 1 from dishes t where t.visit_id = p_id and t.id = (d ->> 'id')::uuid);

  -- Who was there: everyone chosen, plus anyone a dish is attributed to.
  v_people := array(
    select distinct pid
    from unnest(
      coalesce(p_person_ids, '{}') || array(select (d ->> 'person_id')::uuid from jsonb_array_elements(v_dishes) d)
    ) as pid
  );

  delete from visit_people where visit_id = p_id and not (person_id = any (v_people));

  insert into visit_people (visit_id, person_id)
  select p_id, pid
  from unnest(v_people) as pid
  where not exists (select 1 from visit_people vp where vp.visit_id = p_id and vp.person_id = pid);

  return p_id;
end;
$$;

revoke execute on function public.update_visit(uuid, timestamptz, uuid[], jsonb, text) from public, anon;
grant execute on function public.update_visit(uuid, timestamptz, uuid[], jsonb, text) to authenticated;
