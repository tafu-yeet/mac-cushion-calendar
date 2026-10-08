-- Marks events the worker published without review (worker/auto_approve.py),
-- so the admin can tell them apart from ones a person approved.
alter table public.events add column auto_approved boolean not null default false;
