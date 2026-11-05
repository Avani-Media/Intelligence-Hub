-- Serialize all Hub delivery creates/edits/deletes by Salesforce program.
create table public.sf_delivery_program_locks (
 program_id text primary key check(program_id ~ '^a02([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'),
 request_id uuid not null unique,
 created_at timestamptz not null default now()
);
alter table public.sf_delivery_program_locks enable row level security;
revoke all on public.sf_delivery_program_locks from public,anon,authenticated;
grant all on public.sf_delivery_program_locks to service_role;
-- Preserve any existing actions whose Salesforce outcome has not been confirmed.
insert into public.sf_delivery_program_locks(program_id,request_id)
 select distinct on(program_id) program_id,id from (
  select program_id,id,created_at from public.sf_delivery_submissions where status in ('checking','submitting','uncertain')
  union all
  select before_snapshot->>'programId',id,created_at from public.sf_delivery_changes where status in ('checking','submitting','uncertain')
 ) active where program_id ~ '^a02([A-Za-z0-9]{12}|[A-Za-z0-9]{15})$'
 order by program_id,created_at;
