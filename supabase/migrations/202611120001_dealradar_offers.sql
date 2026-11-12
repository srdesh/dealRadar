-- DealRadar shared offer collection schema
-- Apply this migration in the Supabase SQL Editor before deploying the Edge Function.

create extension if not exists pgcrypto;

create table if not exists public.dealradar_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null check (source_type in ('rss','atom','merchant_page','authorized_api')),
  source_url text not null,
  feed_url text,
  merchant_name text not null,
  city text,
  country_code text not null,
  latitude double precision,
  longitude double precision,
  category text not null default 'Other',
  authorized boolean not null default false,
  permission_reference text,
  terms_url text,
  enabled boolean not null default false,
  last_fetched_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint source_coordinates_pair check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  constraint source_authorization_evidence check (not enabled or (authorized and permission_reference is not null and length(trim(permission_reference)) > 0))
);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.dealradar_sources(id) on delete set null,
  title text not null,
  business text not null,
  description text,
  category text not null default 'Other',
  discount_percent numeric(5,2),
  offer_code text,
  latitude double precision,
  longitude double precision,
  city text,
  country_code text,
  source_url text,
  source_type text not null check (source_type in ('merchant_website','authorized_social','community')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','source_checked','merchant_confirmed','admin_verified')),
  status text not null default 'pending_review' check (status in ('pending_review','published','rejected','expired')),
  valid_from timestamptz,
  expires_at timestamptz,
  raw_excerpt text,
  content_hash text,
  created_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint offer_coordinates_pair check ((latitude is null and longitude is null) or (latitude between -90 and 90 and longitude between -180 and 180)),
  constraint offer_discount_range check (discount_percent is null or discount_percent between 0 and 100),
  constraint offer_expiry_after_start check (expires_at is null or valid_from is null or expires_at > valid_from)
);

create unique index if not exists offers_source_url_unique on public.offers(source_url) where source_url is not null;
create index if not exists offers_publication_expiry_idx on public.offers(status, expires_at, created_at desc);
create index if not exists offers_location_idx on public.offers(latitude, longitude);
create index if not exists offers_category_idx on public.offers(category, status);
create index if not exists sources_enabled_idx on public.dealradar_sources(enabled, source_type, last_fetched_at);

alter table public.dealradar_sources enable row level security;
alter table public.offers enable row level security;

revoke all on public.dealradar_sources from anon, authenticated;
grant select on public.offers to anon, authenticated;
grant insert, update, delete on public.offers to authenticated;
grant select, insert, update, delete on public.dealradar_sources to authenticated;
revoke insert, update, delete on public.offers from anon;

drop policy if exists "Public can read current verified published offers" on public.offers;
create policy "Public can read current verified published offers"
on public.offers for select to anon, authenticated
using (
  status = 'published'
  and verification_status in ('merchant_confirmed','admin_verified')
  and (expires_at is null or expires_at > now())
  and (valid_from is null or valid_from <= now())
);

-- Admin review is based on a role claim in app_metadata, which users cannot edit themselves.
drop policy if exists "Admins can manage all offers" on public.offers;
create policy "Admins can manage all offers"
on public.offers for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "Admins can manage source registry" on public.dealradar_sources;
create policy "Admins can manage source registry"
on public.dealradar_sources for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create or replace function public.expire_dealradar_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare affected integer;
begin
  update public.offers
     set status = 'expired', updated_at = now()
   where status = 'published'
     and expires_at is not null
     and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.expire_dealradar_offers() from public, anon, authenticated;
grant execute on function public.expire_dealradar_offers() to service_role;
