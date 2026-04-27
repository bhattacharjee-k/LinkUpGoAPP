# Spatial polygons

Drop two GeoJSON files here. Both are HUMAN REQUIRED — sources are public and stable, but they're large enough we don't bundle them in the repo.

## Files

| Path | Coverage | Approx size |
|---|---|---|
| `nyc-ntas.geojson` | NYC Neighborhood Tabulation Areas (NTAs) — 262 polygons | ~1.5MB |
| `chicago-cas.geojson` | Chicago Community Areas — 77 polygons | ~250KB |

## Where to get them

### NYC NTAs

NYC Open Data publishes the Neighborhood Tabulation Areas (2020) dataset as GeoJSON:

- Portal: https://data.cityofnewyork.us
- Search: "Neighborhood Tabulation Areas (NTAs) 2020" (or "2010 NTAs" if you prefer the older boundaries — pick one, document the choice)
- Export: GeoJSON

The expected feature properties include `NTACode` (id) and `NTAName` (name). If your source uses different keys, update `server/geo/polygons.ts` `lookupNyc()` accordingly.

### Chicago Community Areas

Chicago Data Portal:

- Portal: https://data.cityofchicago.org
- Search: "Boundaries - Community Areas (current)"
- Export: GeoJSON

Expected feature properties: `AREA_NUMBE` (id) and `COMMUNITY` (name).

## Verification

After dropping the files in:

```bash
npx tsx server/geo/check_polygons.ts  # quick sanity-check (see file)
```

It samples ~10 known landmarks (Central Park, Times Square, Wrigley Field, etc.) and prints which neighborhood each resolves to.

## Why we don't bundle them

- They're 1–2MB and updated occasionally by the cities — pinning them in git creates drift.
- Different teams may want different vintages (2010 vs 2020 for NYC).
- Keeping the loader path-based means you can swap in your own polygons (e.g., for a third city) without touching code.
