-- A visit's date can be left out, for a meal logged long after and whose
-- date nobody remembers. Null means "don't remember", which is more honest
-- than a made-up date: it would otherwise sort as recent and date the
-- restaurant list with a day that never happened.
--
-- create_visit and update_visit pass p_visited_at straight through, so a
-- null from the app is stored as null with no change to either function.
-- When it was logged is still visits.created_at, which the Feed orders by.

alter table public.visits alter column visited_at drop not null;
