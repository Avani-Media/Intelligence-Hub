-- Supabase migration: salesforce_delivery_changes
create table public.sf_delivery_changes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 user_email text not null,
 kind text not null check(kind in ('edit','delete')),
 record_id text not null check(record_id ~ '^a00([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 partner_id text not null check(partner_id ~ '^a01([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 before_snapshot jsonb not null,
 after_snapshot jsonb,
 review jsonb not null,
 status text not null default 'prepared' check(status in ('prepared','checking','submitting','succeeded','failed','uncertain')),
 error_code text,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index sf_delivery_one_active_change on public.sf_delivery_changes(record_id) where status in ('checking','submitting','uncertain');
create index sf_delivery_changes_user_created on public.sf_delivery_changes(user_id,created_at desc);
create table public.sf_delivery_partner_locks (
 partner_id text primary key check(partner_id ~ '^a01([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
alter table public.sf_delivery_changes enable row level security;
alter table public.sf_delivery_partner_locks enable row level security;
revoke all on public.sf_delivery_changes,public.sf_delivery_partner_locks from public,anon,authenticated;
grant select on public.sf_delivery_changes to authenticated;
grant all on public.sf_delivery_changes,public.sf_delivery_partner_locks to service_role;
create policy sf_delivery_changes_read_self on public.sf_delivery_changes for select to authenticated using ((select auth.uid())=user_id);
-- Locks are server-only; no client access or policies.
insert into public.sf_delivery_partner_locks(partner_id,request_id)
 select distinct on(partner_id) partner_id,id from public.sf_delivery_submissions
 where status in ('checking','submitting','uncertain') order by partner_id,created_at
 on conflict do nothing;
-- Keep request replay history while allowing a new entry after an old one is moved or deleted.
drop index public.sf_delivery_one_active_entry;
create unique index sf_delivery_one_active_entry on public.sf_delivery_submissions(partner_id,delivery_date)
 where status in ('checking','submitting','uncertain');
