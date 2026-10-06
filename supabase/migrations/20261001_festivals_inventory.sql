-- 2026-10-01 · Client meeting changes: Festival categories + inventory.
-- Run once in the Supabase SQL editor on a database created from the v1 schema.
-- Safe to re-run. New databases: run supabase/schema.sql instead (it already includes this).

-- 1 · Festivals become data (Admin → Festivals): name, slug, cover, description, active, order.
create table if not exists public.festivals (
  id          text primary key,
  slug        text not null unique,
  name        text not null,
  active      boolean not null default true,
  sort        integer not null default 100,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists festivals_sort_idx on public.festivals (sort);
alter table public.festivals enable row level security;

-- 2 · Products belong to a festival (products.festival_id → festivals.id) and can track stock.
alter table public.products add column if not exists festival_id text;
alter table public.products add column if not exists stock integer;
create index if not exists products_festival_idx on public.products (festival_id);

-- v1 rows stored the festival as data.occasion; the seeded festival ids use the same values.
update public.products
   set festival_id = data->>'occasion'
 where festival_id is null and data ? 'occasion';

-- 3 · Atomic stock adjustment, used after a website order is paid (delta < 0).
--     Products without stock tracking (stock is null) are left untouched. Never goes below 0.
create or replace function public.adjust_product_stock(p_id text, p_delta integer)
returns void
language sql
as $$
  update public.products
     set stock = greatest(0, stock + p_delta),
         data = jsonb_set(data, '{stock}', to_jsonb(greatest(0, stock + p_delta))),
         updated_at = now()
   where id = p_id
     and stock is not null;
$$;
revoke all on function public.adjust_product_stock(text, integer) from public, anon, authenticated;

-- 4 · The four festivals v1 products already point to (ids match data.occasion).
--     Existing rows are left alone. Covers are added in Admin → Festivals; until then
--     each festival uses its first product photo.
insert into public.festivals (id, slug, name, active, sort, data) values
  ('chinese-new-year', 'chinese-new-year', 'Chinese New Year',     true, 10, '{"id":"chinese-new-year","slug":"chinese-new-year","name":"Chinese New Year","description":"Boxes and hampers for the first visits of the year.","coverImage":null,"active":true,"sort":10}'),
  ('hari-raya',        'hari-raya',        'Hari Raya',            true, 20, '{"id":"hari-raya","slug":"hari-raya","name":"Hari Raya","description":"Gifts for Hari Raya open houses.","coverImage":null,"active":true,"sort":20}'),
  ('dragon-boat',      'dragon-boat',      'Dragon Boat Festival', true, 30, '{"id":"dragon-boat","slug":"dragon-boat","name":"Dragon Boat Festival","description":"Rice dumplings for the Dragon Boat Festival.","coverImage":null,"active":true,"sort":30}'),
  ('mid-autumn',       'mid-autumn',       'Mid-Autumn Festival',  true, 40, '{"id":"mid-autumn","slug":"mid-autumn","name":"Mid-Autumn Festival","description":"Mooncakes and tea for the Mid-Autumn Festival.","coverImage":null,"active":true,"sort":40}')
on conflict (id) do nothing;

-- Stock: existing products start untracked (stock null). Enter a quantity per product in
-- Admin → Products → Inventory to start tracking; 0 shows the product as Sold Out.
