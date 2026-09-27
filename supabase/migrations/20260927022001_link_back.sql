-- Makes invites work both ways. After someone redeems your invite, they link
-- you into their own circle too, so you see the visits they log with you.
-- They pick which of their people is you, or leave p_person_id null to add
-- you as a new person under your display name.
create function public.link_back(p_owner_id uuid, p_person_id uuid default null)
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

  -- Only after redeeming one of their invites, so nobody can attach a stranger.
  if p_owner_id = auth.uid()
     or not exists (select 1 from people where owner_id = p_owner_id and linked_user_id = auth.uid()) then
    raise exception 'You can only share back with someone whose invite you have used';
  end if;

  -- Already linked: nothing to do.
  select * into r from people where owner_id = auth.uid() and linked_user_id = p_owner_id;
  if found then
    return r;
  end if;

  if p_person_id is not null then
    update people
    set linked_user_id = p_owner_id, invite_code = null
    where id = p_person_id and owner_id = auth.uid() and not is_me and linked_user_id is null
    returning * into r;

    if not found then
      raise exception 'Pick someone in your circle who has not joined yet';
    end if;
  else
    insert into people (owner_id, name, linked_user_id)
    select auth.uid(), display_name, p_owner_id from profiles where id = p_owner_id
    returning * into r;
  end if;

  return r;
end;
$$;

revoke execute on function public.link_back(uuid, uuid) from public, anon;
grant execute on function public.link_back(uuid, uuid) to authenticated;
