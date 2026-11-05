-- Applied through Supabase migration: salesforce_delivery_recording
create table public.sf_delivery_writers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.sf_delivery_submissions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete set null,
 user_email text not null,
 partner_id text not null check (partner_id ~ '^a01([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 program_id text not null check (program_id ~ '^a02([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 delivery_date date not null check (delivery_date >= date '2026-01-01'),
 delivered_volume integer not null check (delivered_volume between 1 and 1000000),
 status text not null default 'prepared' check (status in ('prepared','checking','submitting','succeeded','failed','blocked','uncertain')),
 review jsonb not null,
 sf_delivery_id text,
 error_code text,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create unique index sf_delivery_one_active_entry on public.sf_delivery_submissions(partner_id,delivery_date)
 where status in ('checking','submitting','succeeded','uncertain');
create index sf_delivery_submissions_user_created on public.sf_delivery_submissions(user_id,created_at desc);
alter table public.sf_delivery_writers enable row level security;
alter table public.sf_delivery_submissions enable row level security;
revoke all on public.sf_delivery_writers,public.sf_delivery_submissions from public,anon,authenticated;
grant select on public.sf_delivery_writers,public.sf_delivery_submissions to authenticated;
grant all on public.sf_delivery_writers,public.sf_delivery_submissions to service_role;
create policy sf_delivery_writer_read_self on public.sf_delivery_writers for select to authenticated using ((select auth.uid())=user_id);
create policy sf_delivery_audit_read_self on public.sf_delivery_submissions for select to authenticated using ((select auth.uid())=user_id);
insert into public.sf_delivery_writers(user_id)
 select id from auth.users where lower(email) in ('ian.dimaunahan@avanimedia.com','operations@avanimedia.com');
