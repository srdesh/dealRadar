# DealRadar

**Discover deals. Explore nearby. Save more.**

A responsive, map-first local business and offer discovery app with a shared-offer backend scaffold.

## What works in the web app

- User-initiated browser location sharing and city/neighbourhood/address search.
- Configurable 0.25–20 km search radius, business categories, Leaflet map and OpenStreetMap place discovery.
- Separate map markers and result cards for businesses and offers.
- When Supabase is configured, the browser loads only published, verified, unexpired offers from the shared database within the selected area.
- Offers retain their original source link, merchant, country/city, verification status and expiry date.
- Browser-only offer drafts remain local and are clearly labeled; they are not represented as shared or verified offers.

## Offer collection architecture

DealRadar now includes a Supabase/Postgres backend scaffold:

- `supabase/migrations/202611120001_dealradar_offers.sql` creates the source registry, offers table, indexes, Row Level Security (RLS), admin review policies and expiry function.
- `supabase/functions/ingest-offers/index.ts` imports candidates from authorized RSS/Atom feeds, permitted merchant promotion pages and a normalized authorized social/API feed.
- `supabase/scheduled-ingestion.sql` contains optional 30-minute collection and daily expiry schedules.
- `supabase/SOURCES.md` documents source authorization and onboarding.
- `config.js` contains the public browser configuration placeholders.

Every imported candidate is created as `pending_review` with `source_checked`; the collector does not auto-publish discounts. An administrator must verify the merchant, promotion, location, terms and dates before setting `status = 'published'` and `verification_status = 'merchant_confirmed'` or `admin_verified'`. Expired published offers are moved to `expired`.

### Compliant collection policy

- Merchant websites: only fetch a specific public promotion page/feed where terms or written permission allow automated retrieval. The merchant-page adapter checks `robots.txt` and fails closed if it cannot confirm access is allowed.
- Social media: use an official API, merchant-authorized connection or licensed partner feed only. DealRadar does not scrape login-only pages, private groups, personal profiles or attempt to bypass platform controls.
- Authorized social API adapter: set `AUTHORIZED_SOCIAL_API_URL` and `AUTHORIZED_SOCIAL_API_TOKEN` as server-side Edge Function secrets. The endpoint must return JSON in this shape:
  ```json
  { "items": [{ "title": "Offer headline", "url": "https://merchant.example/offer", "text": "Offer terms", "published_at": "2026-11-01T00:00:00Z", "expires_at": "2026-11-30T23:59:59Z", "merchant_name": "Merchant", "discount_percent": "15%" }] }
  ```
- All source hosts must be listed in `SOURCE_HOST_ALLOWLIST`. Each enabled source must have `authorized = true`, a permission reference and terms URL. Never add guessed feed URLs or sources without permission.
- The collector rejects expired candidates and a conservative set of regulated/age-restricted promotion categories. Extraction is not proof that an offer is valid; human review is required.
- Respect source terms, platform developer policies, copyright, privacy, rate limits, attribution and applicable local law. Keep an audit trail of permission and verification.

### Initial coverage: Winnipeg, with international-ready records

The database stores country code, city and optional coordinates for every source and offer. Start the pilot with Winnipeg merchants that explicitly agree to participate. Expand by adding authorized source records for each city/country; do not turn on a source until its feed, permissions, terms and location mapping have been checked. No merchant feeds are preloaded because no merchant has yet granted DealRadar access.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase/migrations/202611120001_dealradar_offers.sql`.
3. Deploy the Edge Function from the repository root:
   ```bash
   supabase functions deploy ingest-offers
   ```
4. Set Edge Function secrets. Use a long random ingestion secret and a comma-separated allowlist of exact merchant/API hostnames:
   ```bash
   supabase secrets set DEALRADAR_INGEST_SECRET="YOUR_LONG_RANDOM_SECRET" SOURCE_HOST_ALLOWLIST="merchant.example,api.partner.example"
   ```
   For an authorized social/API connector, also set `AUTHORIZED_SOCIAL_API_URL` and `AUTHORIZED_SOCIAL_API_TOKEN`. Never put these secrets in `config.js` or browser code.
5. In `config.js`, set `supabaseUrl` to the project URL and `supabasePublishableKey` to the project's publishable key. A publishable key is intended for browser use; the SQL migration applies RLS. Never use a service-role/secret key in the browser.
6. In Supabase Auth user metadata, grant the trusted reviewer the server-managed `app_metadata.role = admin` claim. The admin policies use this claim. Do not use user-editable `user_metadata` for admin authorization.
7. Add authorized source rows in `dealradar_sources` (Supabase Table Editor or SQL). Example template only—replace every placeholder with a real merchant-approved source:
   ```sql
   insert into public.dealradar_sources
     (name, source_type, source_url, feed_url, merchant_name, city, country_code,
      latitude, longitude, category, authorized, permission_reference, terms_url, enabled)
   values
     ('Merchant promotions feed', 'rss', 'https://merchant.example',
      'https://merchant.example/approved-promotions.xml', 'Merchant Name',
      'Winnipeg', 'CA', 49.8951, -97.1384, 'Other', true,
      'Written permission reference / agreement ID',
      'https://merchant.example/terms', true);
   ```
8. Store the project URL, publishable key and same ingestion secret in Supabase Vault, edit the placeholders in `supabase/scheduled-ingestion.sql`, and run it once in the SQL Editor to enable scheduled collection and expiry. Enable the `pg_cron`, `pg_net` and Vault extensions if they are not already available.
9. Review imported candidates in the Supabase Table Editor. Publish only after verification. The public app reads only verified, published and unexpired records.

**Important deployment boundary:** The GitHub repository contains the application and backend implementation, but this workspace does not have your Supabase project credentials or merchant permission agreements. Therefore the shared database, scheduled collector and live merchant/social feeds are not deployed or active yet. GitHub Pages alone cannot run the Edge Function or store shared data.

## Run locally

Open `index.html` through a local web server:

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000. Browser geolocation requires HTTPS or localhost.

## External services

- Supabase Postgres, RLS and Edge Functions (shared offer backend)
- Leaflet for map rendering
- OpenStreetMap tiles and business/place data
- Nominatim for address search and reverse geocoding
- Overpass API for nearby business discovery
- Google Fonts for typography

Follow each provider's acceptable-use policy, rate limits and attribution requirements. For a public international launch, add caching, monitoring, source-specific crawl schedules, localization, currency handling, privacy review and a merchant onboarding process.

## Deploy the static app

The repository includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`. In GitHub, open **Settings → Pages** and select **GitHub Actions** as the deployment source. Subsequent pushes to `main` trigger deployment.
