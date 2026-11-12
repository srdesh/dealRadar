# DealRadar source onboarding

Only onboard sources that DealRadar is authorized to access. Do not scrape login-only pages, private groups, personal profiles, or platforms that prohibit automated collection. For social platforms, use an official API or a partner feed with documented permission. Do not attempt to bypass rate limits, access controls, CAPTCHAs, or technical restrictions.

## Supported source adapters

- `rss` / `atom`: a merchant-owned public feed or a licensed syndication feed.
- `merchant_page`: a merchant-owned promotion page where written permission or terms explicitly allow automated retrieval. The collector checks `robots.txt` before fetching.
- `authorized_api`: a normalized JSON feed supplied under an API agreement. Configure `AUTHORIZED_SOCIAL_API_URL` and `AUTHORIZED_SOCIAL_API_TOKEN` as Edge Function secrets. Expected response: `{ "items": [{ "title", "url", "text", "published_at", "expires_at", "merchant_name", "discount_percent" }] }`.

For every source, record the merchant, country code, city, coordinates where known, terms URL, and a permission reference. The collector only processes enabled sources with `authorized = true` and non-empty permission evidence. The API host must be included in `SOURCE_HOST_ALLOWLIST`.

## Winnipeg pilot

Start with a small number of merchants who have explicitly agreed to participate. Ask each merchant for one of:
1. A public RSS/Atom promotions feed;
2. A specific promotion page and written permission for automated retrieval; or
3. An authorized API/feed connection.

Do not insert guessed feed URLs. Keep sources disabled until permission and feed behavior are checked.

## Review workflow

1. Collector imports candidate offers as `pending_review` with `source_checked`.
2. Admin checks merchant identity, location, terms, start/expiry dates, and source link.
3. Admin confirms the offer and changes `verification_status` to `merchant_confirmed` or `admin_verified`, then sets `status = 'published'`.
4. Expired offers are changed to `expired` by the scheduled expiry task.

Automated extraction is not proof that a promotion is still valid. Never auto-publish scraped candidates.
