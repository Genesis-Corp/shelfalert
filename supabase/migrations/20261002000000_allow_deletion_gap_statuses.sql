-- Deletion workflow stores these statuses on gaps; the original check rejected them.
alter table public.gaps drop constraint gaps_status_check;
alter table public.gaps add constraint gaps_status_check check (status = any (array['open','ordered','unavailable','missed','deletion_confirmed','deletion_followup']));
