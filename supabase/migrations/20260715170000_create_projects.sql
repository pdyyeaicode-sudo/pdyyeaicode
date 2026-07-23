create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null,
  name text not null check (char_length(trim(name)) between 1 and 120),
  thumbnail_url text,
  document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_owner_updated_at_idx
  on public.projects (owner_id, updated_at desc);

create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.set_projects_updated_at();

alter table public.projects enable row level security;

create policy "Clerk users can view their own projects"
  on public.projects for select
  using ((auth.jwt() ->> 'sub') = owner_id);

create policy "Clerk users can create their own projects"
  on public.projects for insert
  with check ((auth.jwt() ->> 'sub') = owner_id);

create policy "Clerk users can update their own projects"
  on public.projects for update
  using ((auth.jwt() ->> 'sub') = owner_id)
  with check ((auth.jwt() ->> 'sub') = owner_id);

create policy "Clerk users can delete their own projects"
  on public.projects for delete
  using ((auth.jwt() ->> 'sub') = owner_id);
