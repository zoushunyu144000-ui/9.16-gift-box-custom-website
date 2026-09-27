-- Moire Co. — Supabase schema
-- Run once in the Supabase SQL editor (Project → SQL → New query).
-- The app talks to these tables from the server with the service role key only;
-- Row Level Security is enabled with no public policies, so the browser cannot read them directly.

create table if not exists public.products (
  id          text primary key,
  slug        text not null unique,
  category    text not null check (category in ('festive','fixed-gifts','wine-spirits')),
  status      text not null check (status in ('active','sold_out','hidden')),
  featured    boolean not null default false,
  sort        integer not null default 100,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists products_category_idx on public.products (category, sort);

create table if not exists public.orders (
  id          text primary key,
  status      text not null,
  email       text not null,
  total       numeric(12,2) not null,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.enquiries (
  id          text primary key,
  type        text not null check (type in ('semi-curated','bespoke')),
  status      text not null,
  data        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists enquiries_created_idx on public.enquiries (created_at desc);

create table if not exists public.settings (
  key         text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.products  enable row level security;
alter table public.orders    enable row level security;
alter table public.enquiries enable row level security;
alter table public.settings  enable row level security;

-- Public bucket for product photos (uploaded through /admin, already resized to WebP).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;
