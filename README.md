# DealRadar

**Discover deals. Explore nearby. Save more.**

A responsive, map-first local business and offer discovery prototype.

## Live location and nearby discovery

- The user chooses when to share browser GPS location; the site does not request it automatically.
- Users can also search for a city, neighbourhood, or address without sharing GPS.
- Search radius is configurable from 0.25 to 20 km.
- Nearby shops, restaurants, cafés, and other mapped businesses are discovered from OpenStreetMap using the Overpass API.
- Categories can be filtered and businesses appear on a Leaflet map.
- Users can submit a local offer and save it in their browser for this POC.

## Important offer-data limitation

OpenStreetMap provides business/place information, not a reliable feed of current discounts. There is no universal public API that exposes every live offer from Google, Facebook, Instagram, and all merchants. This POC therefore **does not invent discounts** for nearby businesses. It shows whether a DealRadar offer has been entered locally; browser-local submissions are not shared with other users and are not verified. A production shared offer database requires a backend (for example Supabase/Postgres + PostGIS), merchant accounts, moderation, and permitted promotional data integrations.

## Run locally

Open `index.html` through a local web server (recommended):

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000. Browser geolocation requires HTTPS or localhost.

## External services

- Leaflet for map rendering
- OpenStreetMap tiles and map data
- Nominatim for address search and reverse geocoding
- Overpass API for nearby business discovery
- Google Fonts for typography

These public services have usage policies and rate limits. For a public production launch, use service providers appropriate to the expected traffic, add caching, and follow attribution and acceptable-use requirements.

## Deploy

A GitHub Actions workflow is included at `.github/workflows/deploy-pages.yml`. In the repository, open **Settings → Pages** and set the build/deployment source to **GitHub Actions**. Subsequent pushes to `main` trigger deployment automatically.

## Production next steps

1. Add Supabase Auth and a shared Postgres/PostGIS offer database.
2. Persist merchant submissions and user bookmarks server-side.
3. Add merchant and admin dashboards with moderation.
4. Integrate authorized merchant/social feeds and licensed promotion providers.
5. Add source attribution, validity checks, expiry jobs, duplicate detection, and verification history.
6. Add rate-limited geocoding and cached nearby-business queries.
