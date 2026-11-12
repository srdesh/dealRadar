# DealRadar

**Discover deals. Explore nearby. Save more.**

A responsive, map-first local offers discovery POC.

## Run locally
Open `index.html` in a modern browser. An internet connection is required for the Leaflet library, OpenStreetMap tiles and web fonts.

For a local web server:
```bash
python3 -m http.server 8000
```
Then visit http://localhost:8000.

## Features
- Downtown Winnipeg demonstration map powered by Leaflet and OpenStreetMap
- Category filters and distance radius control
- Offer pins and detail popups
- Sort by distance, discount, or store name
- Bookmark offers (stored in browser localStorage)
- Browser geolocation control
- Offer sharing via native share or clipboard
- Demonstration merchant offer submission form
- Responsive desktop and mobile layout

## Important POC limitations
All businesses and discounts are fictional demonstration records. They are not verified, current, sponsored, or redeemable offers. The search location control is a UI demonstration (not a production geocoder). GPS only recenters the map; the sample offer database remains Downtown Winnipeg. Bookmarking is local to the browser. Offer submissions are not saved to a backend. There are no live Google, Facebook, Instagram, merchant, or affiliate integrations.

## Deployment
This is a static site. It can be published using GitHub Pages, Netlify, or another static hosting service. For GitHub Pages, open repository **Settings → Pages**, choose **Deploy from a branch**, select **main** and **/(root)**, and save. GitHub will show the published URL when the Pages deployment completes.

## Next steps
- Add a geocoder and dynamic location search
- Add a backend and PostGIS for real geospatial offer search
- Add merchant and admin authentication
- Add offer moderation, validity and source verification
- Integrate permitted merchant and promotional data feeds
- Add OCR/AI extraction and duplicate detection
