-- One optional photo per dish, kept in the private "dish-photos" bucket.
--
-- Each file lives in its visit's folder: <owner id>/<visit id>/<dish id>.jpg.
-- Access follows the visit: whoever can see a visit can see its photos, and
-- only the visit's owner can add them. The app shrinks photos to a JPEG of
-- about 250 KB before uploading, and strips their location data.
--
-- Saving is: create_visit (with ids chosen by the app), upload each photo,
-- then set dishes.photo_path for the uploads that worked.

alter table public.dishes add column photo_path text;

-- The path must be this dish's own file in this visit's folder, so a dish can
-- never point at a photo from someone else's visit.
alter table public.dishes add constraint dishes_photo_path_in_visit_folder check (
  photo_path is null
  or photo_path ~ ('^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/' || visit_id::text || '/' || id::text || '\.jpg$')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dish-photos', 'dish-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- The visit id from a photo path, or null for anything that isn't one.
-- Checked with a regex first so a stray file name can't make a policy throw.
create function public.photo_visit_id(p_name text)
returns uuid language sql immutable as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    then split_part(p_name, '/', 2)::uuid
  end;
$$;

-- Your own folder is always readable too, so the app can find and remove a
-- visit's photos after the visit itself is gone.
create policy "dish photos: read with the visit" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dish-photos'
    and (split_part(name, '/', 1) = auth.uid()::text or public.can_view_visit(public.photo_visit_id(name)))
  );

create policy "dish photos: visit owner uploads" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dish-photos'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.owns_visit(public.photo_visit_id(name))
  );

-- Upload retries overwrite the same file.
create policy "dish photos: visit owner replaces" on storage.objects
  for update to authenticated
  using (bucket_id = 'dish-photos' and split_part(name, '/', 1) = auth.uid()::text)
  with check (
    bucket_id = 'dish-photos'
    and split_part(name, '/', 1) = auth.uid()::text
    and public.owns_visit(public.photo_visit_id(name))
  );

-- Only your own folder. Deliberately not tied to the visit, because the app
-- removes a visit's photos right after deleting the visit itself.
create policy "dish photos: owner removes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dish-photos' and split_part(name, '/', 1) = auth.uid()::text);

-- create_visit now takes ids chosen by the app (the visit's, and one per
-- dish), so photos can be uploaded into the right folder as soon as it returns.
drop function public.create_visit(uuid, timestamptz, uuid[], jsonb, text);

create function public.create_visit(
  p_restaurant_id uuid,
  p_visited_at timestamptz,
  p_person_ids uuid[],
  p_dishes jsonb,
  p_notes text default null,
  p_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into visits (id, restaurant_id, visited_at, notes)
  values (coalesce(p_id, gen_random_uuid()), p_restaurant_id, p_visited_at, nullif(trim(p_notes), ''))
  returning id into v_id;

  insert into visit_people (visit_id, person_id)
  select distinct v_id, pid
  from unnest(
    p_person_ids || array(
      select (d ->> 'person_id')::uuid from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) d
    )
  ) as pid;

  insert into dishes (id, visit_id, person_id, name, rating, would_order_again, notes)
  select coalesce((d ->> 'id')::uuid, gen_random_uuid()),
         v_id,
         (d ->> 'person_id')::uuid,
         trim(d ->> 'name'),
         (d ->> 'rating')::smallint,
         coalesce((d ->> 'would_order_again')::boolean, false),
         nullif(trim(d ->> 'notes'), '')
  from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) d;

  return v_id;
end;
$$;
