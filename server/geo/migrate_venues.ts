// One-shot migration to backfill spatial fields on existing suggestions.
//
// HUMAN REQUIRED: this introduces new columns to the `suggestions` table.
// Coordinate with mobile (TestFlight) before merging — schema changes can
// invalidate cached responses or installed builds. Migration is **additive**
// (all new columns nullable), so it should be safe, but confirm before pushing
// to Neon prod.
//
// The columns are added in a Drizzle migration (run `npm run db:generate`
// after updating shared/schema.ts), then this script populates them for existing
// rows.
//
// Run: npx tsx server/geo/migrate_venues.ts [--dry-run]

import { db } from '../storage';
import { suggestions, type Suggestion } from '@shared/schema';
import { sql, eq, isNull } from 'drizzle-orm';
import { resolveByCoords } from './lookup';
import { h3Cell, H3_RES_BLOCK, H3_RES_NEIGHBORHOOD, h3Coarsen } from './h3';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH = 50;

interface VenueCoords {
  id: string;
  city: string;
  lat: number;
  lng: number;
}

async function fetchUnmigrated(): Promise<VenueCoords[]> {
  // We need lat/lng but the legacy `suggestions` row doesn't store them — only
  // the `distance` text. Coords come from the placeId via Google Places. For
  // the migration we read lat/lng from a future column (`venue_lat`,
  // `venue_lng`) that the schema migration adds.
  //
  // If these columns don't exist yet (because the schema migration hasn't run),
  // this query throws — which is the right failure mode.
  const rows = await db.execute<{
    id: string;
    city: string;
    venue_lat: string | null;
    venue_lng: string | null;
  }>(sql`SELECT id, city, venue_lat, venue_lng FROM ${suggestions}
         WHERE nta_id IS NULL AND venue_lat IS NOT NULL AND venue_lng IS NOT NULL
         LIMIT 50000`);

  const results: VenueCoords[] = [];
  for (const r of rows.rows) {
    const lat = parseFloat(r.venue_lat ?? '');
    const lng = parseFloat(r.venue_lng ?? '');
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    results.push({ id: r.id, city: r.city, lat, lng });
  }
  return results;
}

async function migrateOne(v: VenueCoords): Promise<void> {
  const resolved = await resolveByCoords(v.city, v.lat, v.lng);
  const cellRes9 = h3Cell(v.lat, v.lng, H3_RES_BLOCK);
  const cellRes7 = h3Coarsen(cellRes9, H3_RES_NEIGHBORHOOD);

  if (DRY_RUN) {
    console.log(`[migrate-dry] ${v.id} → nta=${resolved.ntaId} mbx=${resolved.mapboxNeighId} h3_9=${cellRes9}`);
    return;
  }

  await db.execute(sql`
    UPDATE ${suggestions}
    SET nta_id = ${resolved.ntaId},
        mapbox_neigh_id = ${resolved.mapboxNeighId},
        neighborhood_name = ${resolved.name},
        h3_res9 = ${cellRes9},
        h3_res7 = ${cellRes7}
    WHERE id = ${v.id}
  `);
}

async function main() {
  const venues = await fetchUnmigrated();
  console.log(`[migrate] ${venues.length} venues to migrate (dryRun=${DRY_RUN})`);
  if (venues.length === 0) return;

  for (let i = 0; i < venues.length; i += BATCH) {
    const slice = venues.slice(i, i + BATCH);
    await Promise.all(slice.map(migrateOne));
    console.log(`[migrate] ${Math.min(i + BATCH, venues.length)} / ${venues.length}`);
  }
  console.log('[migrate] Done');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Failed:', err);
      process.exit(1);
    });
}
