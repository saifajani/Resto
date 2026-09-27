-- Circle-wide sharing of visits and dishes.
--
-- Before: you could only see a visit if you logged it yourself, or if a person
-- standing for you was on it. So dish feedback from your circle was invisible
-- unless you happened to eat together, which defeats the point of the app.
--
-- Now: anyone you have linked into your circle sees every visit you log, with
-- its dishes, ratings and notes. Sharing still follows an invite that was
-- actually redeemed, and it is not transitive: your wife seeing your visits
-- does not let her see your brother's unless he has linked her too.
--
-- The visit date is deliberately still returned. The app hides it for visits
-- you weren't on, which is a presentation choice, not a privacy boundary.

create or replace function public.can_view_visit(p_visit_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from visits v
    where v.id = p_visit_id
      and (
        v.owner_id = auth.uid()
        -- The person who logged it has linked you into their circle.
        or exists (
          select 1
          from people p
          where p.owner_id = v.owner_id and p.linked_user_id = auth.uid()
        )
      )
  );
$$;

-- Dishes are attributed to people in the logger's circle, so those people need
-- names for the "what to order" summary to read properly.
create or replace function public.can_view_person(p_person_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from people
           where id = p_person_id and (owner_id = auth.uid() or linked_user_id = auth.uid())
         )
      or exists (
           select 1
           from people target
           join people mine on mine.owner_id = target.owner_id
           where target.id = p_person_id and mine.linked_user_id = auth.uid()
         )
      or exists (
           select 1 from visit_people vp
           where vp.person_id = p_person_id and public.can_view_visit(vp.visit_id)
         );
$$;
