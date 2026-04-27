// Sanity-check that the polygon files are loaded correctly.
// Usage: npx tsx server/geo/check_polygons.ts

import { lookupNyc, lookupChicago } from './polygons';

const nycLandmarks: Array<{ name: string; lat: number; lng: number; expected?: string }> = [
  { name: 'Times Square', lat: 40.7580, lng: -73.9855, expected: 'Midtown' },
  { name: 'Williamsburg Bridge tower (Brooklyn side)', lat: 40.7137, lng: -73.9601 },
  { name: 'Central Park (Bethesda Terrace)', lat: 40.7740, lng: -73.9708 },
  { name: 'Yankee Stadium', lat: 40.8296, lng: -73.9262 },
  { name: 'Coney Island', lat: 40.5749, lng: -73.9857 },
  { name: 'Rockaway Beach', lat: 40.5808, lng: -73.8154 },
];

const chicagoLandmarks: Array<{ name: string; lat: number; lng: number; expected?: string }> = [
  { name: 'Wrigley Field', lat: 41.9484, lng: -87.6553, expected: 'Lake View' },
  { name: 'Cloud Gate (The Bean)', lat: 41.8827, lng: -87.6233, expected: 'Loop' },
  { name: 'Lincoln Park Zoo', lat: 41.9217, lng: -87.6336, expected: 'Lincoln Park' },
  { name: 'Hyde Park (UChicago Quad)', lat: 41.7895, lng: -87.5996, expected: 'Hyde Park' },
];

function check(label: string, points: typeof nycLandmarks, lookup: typeof lookupNyc) {
  console.log(`\n=== ${label} ===`);
  for (const p of points) {
    const m = lookup(p.lat, p.lng);
    const tag = m ? `${m.name} (id=${m.id})` : 'NOT FOUND';
    const ok = !p.expected ? '?' : m?.name?.toLowerCase().includes(p.expected.toLowerCase()) ? 'PASS' : 'FAIL';
    console.log(`  [${ok}] ${p.name.padEnd(40)} → ${tag}`);
  }
}

check('NYC NTAs', nycLandmarks, lookupNyc);
check('Chicago Community Areas', chicagoLandmarks, lookupChicago);
