-- Resto v1 schema.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Sharing model:
--   * Every user owns a "circle" of people. One of them is the user (is_me).
--   * Visits and dishes belong to the user who logged them.
--   * Each dish is attributed to a person in the owner's circle.
--   * When a person in your circle redeems an invite code, their account is
--     linked to that person (people.linked_user_id). From then on they can read
--     every visit that person was part of, including future ones. Read only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Me',
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  is_me boolean not null default false,
  linked_user_id uuid references public.profiles (id) on delete set null,
  invite_code text unique,
  created_at timestamptz not null default now()
);

create unique index people_one_me_per_owner on public.people (owner_id) where is_me;
create unique index people_one_link_per_circle on public.people (owner_id, linked_user_id)
  where linked_user_id is not null;
create index people_linked_user_idx on public.people (linked_user_id);

-- Shared catalog of places, keyed by Apple Maps' stable place ID.
create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  apple_place_id text unique,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  visited_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);

create index visits_owner_idx on public.visits (owner_id);
create index visits_restaurant_idx on public.visits (restaurant_id);

create table public.visit_people (
  visit_id uuid not null references public.visits (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  primary key (visit_id, person_id)
);

create index visit_people_person_idx on public.visit_people (person_id);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.visits (id) on delete cascade,
  -- restrict: deleting a person who has dishes logged fails instead of silently erasing history
  person_id uuid not null references public.people (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  rating smallint not null check (rating between 1 and 5),
  would_order_again boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create index dishes_visit_idx on public.dishes (visit_id);
create index dishes_person_idx on public.dishes (person_id);

-- ---------------------------------------------------------------------------
-- New user setup: a profile plus a "me" person in their own circle
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    'Me'
  );
begin
  insert into public.profiles (id, display_name) values (new.id, v_name);
  insert into public.people (owner_id, name, is_me, linked_user_id)
    values (new.id, v_name, true, new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can call them without the
-- policies on one table recursing into the policies on another.
-- ---------------------------------------------------------------------------

create function public.owns_visit(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits where id = p_visit_id and owner_id = auth.uid());
$$;

create function public.owns_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from people where id = p_person_id and owner_id = auth.uid());
$$;

create function public.can_view_visit(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from visits where id = p_visit_id and owner_id = auth.uid())
      or exists (
        select 1
        from visit_people vp
        join people p on p.id = vp.person_id
        where vp.visit_id = p_visit_id and p.linked_user_id = auth.uid()
      );
$$;

create function public.can_view_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from people
           where id = p_person_id and (owner_id = auth.uid() or linked_user_id = auth.uid())
         )
      or exists (
           select 1 from visit_people vp
           where vp.person_id = p_person_id and public.can_view_visit(vp.visit_id)
         );
$$;

create function public.can_view_profile(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_profile_id = auth.uid()
      or exists (
           select 1 from people
           where (owner_id = p_profile_id and linked_user_id = auth.uid())
              or (owner_id = auth.uid() and linked_user_id = p_profile_id)
         );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.restaurants enable row level security;
alter table public.visits enable row level security;
alter table public.visit_people enable row level security;
alter table public.dishes enable row level security;

create policy "profiles: read self and linked" on public.profiles
  for select to authenticated using (public.can_view_profile(id));
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "people: read visible" on public.people
  for select to authenticated using (public.can_view_person(id));
create policy "people: owner adds" on public.people
  for insert to authenticated
  with check (owner_id = auth.uid() and not is_me and linked_user_id is null and invite_code is null);
create policy "people: owner renames" on public.people
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "people: owner removes" on public.people
  for delete to authenticated using (owner_id = auth.uid() and not is_me);

create policy "restaurants: anyone signed in reads" on public.restaurants
  for select to authenticated using (true);
-- Inserts go through get_or_create_restaurant().

-- The inline owner check matters: a newly inserted row is not yet visible to
-- the helper function's snapshot, so INSERT ... RETURNING needs it.
create policy "visits: read own or shared" on public.visits
  for select to authenticated using (owner_id = auth.uid() or public.can_view_visit(id));
create policy "visits: owner writes" on public.visits
  for insert to authenticated with check (owner_id = auth.uid());
create policy "visits: owner updates" on public.visits
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "visits: owner deletes" on public.visits
  for delete to authenticated using (owner_id = auth.uid());

create policy "visit_people: read own or shared" on public.visit_people
  for select to authenticated using (public.can_view_visit(visit_id));
create policy "visit_people: owner adds" on public.visit_people
  for insert to authenticated
  with check (public.owns_visit(visit_id) and public.owns_person(person_id));
create policy "visit_people: owner removes" on public.visit_people
  for delete to authenticated using (public.owns_visit(visit_id));

create policy "dishes: read own or shared" on public.dishes
  for select to authenticated using (public.can_view_visit(visit_id));
create policy "dishes: owner adds" on public.dishes
  for insert to authenticated
  with check (public.owns_visit(visit_id) and public.owns_person(person_id));
create policy "dishes: owner updates" on public.dishes
  for update to authenticated
  using (public.owns_visit(visit_id))
  with check (public.owns_visit(visit_id) and public.owns_person(person_id));
create policy "dishes: owner deletes" on public.dishes
  for delete to authenticated using (public.owns_visit(visit_id));

-- Column-level limits: links and invite codes only change through the
-- functions below, so nobody can link a stranger's account by hand.
revoke update on public.people from anon, authenticated;
grant update (name) on public.people to authenticated;
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
revoke all on public.restaurants from anon;
grant select on public.restaurants to authenticated;

-- ---------------------------------------------------------------------------
-- RPC functions called by the app
-- ---------------------------------------------------------------------------

create function public.get_or_create_restaurant(
  p_apple_place_id text,
  p_name text,
  p_address text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns public.restaurants
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.restaurants;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into restaurants (apple_place_id, name, address, latitude, longitude)
  values (p_apple_place_id, p_name, p_address, p_latitude, p_longitude)
  on conflict (apple_place_id) do update
    set name = excluded.name,
        address = coalesce(excluded.address, restaurants.address),
        latitude = coalesce(excluded.latitude, restaurants.latitude),
        longitude = coalesce(excluded.longitude, restaurants.longitude)
  returning * into r;

  return r;
end;
$$;

-- Saves a visit, who was there, and every dish in one transaction.
-- SECURITY INVOKER so the normal row-level security rules apply.
create function public.create_visit(
  p_restaurant_id uuid,
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
  v_id uuid;
begin
  insert into visits (restaurant_id, visited_at, notes)
  values (p_restaurant_id, p_visited_at, nullif(trim(p_notes), ''))
  returning id into v_id;

  insert into visit_people (visit_id, person_id)
  select distinct v_id, pid
  from unnest(
    p_person_ids || array(
      select (d ->> 'person_id')::uuid from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) d
    )
  ) as pid;

  insert into dishes (visit_id, person_id, name, rating, would_order_again, notes)
  select v_id,
         (d ->> 'person_id')::uuid,
         trim(d ->> 'name'),
         (d ->> 'rating')::smallint,
         coalesce((d ->> 'would_order_again')::boolean, false),
         nullif(trim(d ->> 'notes'), '')
  from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) d;

  return v_id;
end;
$$;

-- Creates (or returns the existing) invite code for someone in your circle.
create function public.create_invite(p_person_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select invite_code into v_code
  from people
  where id = p_person_id and owner_id = auth.uid() and not is_me and linked_user_id is null;

  if not found then
    raise exception 'You can only invite people in your circle who have not joined yet';
  end if;

  if v_code is not null then
    return v_code;
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from people where invite_code = v_code);
  end loop;

  update people set invite_code = v_code where id = p_person_id;
  return v_code;
end;
$$;

-- Links the signed-in user to the person the invite code was made for.
create function public.claim_invite(p_code text)
returns public.people
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.people;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  select * into r
  from people
  where invite_code = upper(trim(p_code)) and linked_user_id is null
  for update;

  if not found then
    raise exception 'That invite code is not valid or has already been used';
  end if;

  if r.owner_id = auth.uid() then
    raise exception 'That invite is for someone in your own circle';
  end if;

  if exists (select 1 from people where owner_id = r.owner_id and linked_user_id = auth.uid()) then
    raise exception 'You are already linked to someone in that circle';
  end if;

  update people
  set linked_user_id = auth.uid(), invite_code = null
  where id = r.id
  returning * into r;

  return r;
end;
$$;

-- Updates your display name and the name of your "me" person together.
create function public.set_display_name(p_name text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Name cannot be empty';
  end if;
  update profiles set display_name = trim(p_name) where id = auth.uid();
  update people set name = trim(p_name) where owner_id = auth.uid() and is_me;
end;
$$;

revoke execute on function
  public.get_or_create_restaurant(text, text, text, double precision, double precision),
  public.create_visit(uuid, timestamptz, uuid[], jsonb, text),
  public.create_invite(uuid),
  public.claim_invite(text),
  public.set_display_name(text)
from public, anon;

grant execute on function
  public.get_or_create_restaurant(text, text, text, double precision, double precision),
  public.create_visit(uuid, timestamptz, uuid[], jsonb, text),
  public.create_invite(uuid),
  public.claim_invite(text),
  public.set_display_name(text)
to authenticated;
