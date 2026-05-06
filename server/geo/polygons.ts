// NYC NTA / Chicago Community Area polygon loader and point-in-polygon lookup.
// GeoJSON files live in server/geo/polygons/ (see polygons/README.md for source URLs).
//
// We don't take a turf.js dependency — point-in-polygon for ray-casting is ~30
// lines and these polygons are stable enough that we'd write a wrapper anyway.
//
// Loaded lazily (first call). Memory footprint: NYC ~1.5MB, Chicago ~250KB —
// fine to keep in-process.

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Cross-mode __dirname: works in ESM dev (tsx) via import.meta.url and in the
// production CJS bundle (esbuild output) where import.meta.url is empty but
// Node's CJS wrapper provides __filename natively.
const moduleFilename: string = typeof __filename === 'string' && __filename
  ? __filename
  : fileURLToPath(import.meta.url);
const __dirname = path.dirname(moduleFilename);
const POLY_DIR = path.join(__dirname, 'polygons');
const NYC_NTA_PATH = path.join(POLY_DIR, 'nyc-ntas.geojson');
const CHICAGO_CA_PATH = path.join(POLY_DIR, 'chicago-cas.geojson');

interface PolygonFeature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface FeatureCollection {
  type: 'FeatureCollection';
  features: PolygonFeature[];
}

export interface NeighborhoodMatch {
  /** Stable id of the neighborhood (NTA code or community-area number). */
  id: string;
  name: string;
  centroid: { lat: number; lng: number };
}

let nycCache: FeatureCollection | null = null;
let chicagoCache: FeatureCollection | null = null;
let warned: Record<string, boolean> = {};

function loadIfPresent(file: string): FeatureCollection | null {
  if (!fs.existsSync(file)) {
    if (!warned[file]) {
      console.warn(`[polygons] ${path.basename(file)} not found. HUMAN REQUIRED — see server/geo/polygons/README.md.`);
      warned[file] = true;
    }
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf8')) as FeatureCollection;
}

function getNyc(): FeatureCollection | null {
  if (nycCache === null) nycCache = loadIfPresent(NYC_NTA_PATH);
  return nycCache;
}
function getChicago(): FeatureCollection | null {
  if (chicagoCache === null) chicagoCache = loadIfPresent(CHICAGO_CA_PATH);
  return chicagoCache;
}

/** Standard ray-cast point-in-ring. Coords are [lng, lat] per GeoJSON. */
function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point: [number, number], geom: PolygonFeature['geometry']): boolean {
  if (geom.type === 'Polygon') {
    const polygon = geom.coordinates as number[][][];
    if (!pointInRing(point, polygon[0])) return false;
    // Holes
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(point, polygon[h])) return false;
    }
    return true;
  }
  // MultiPolygon
  const multi = geom.coordinates as number[][][][];
  for (const polygon of multi) {
    if (!pointInRing(point, polygon[0])) continue;
    let inHole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(point, polygon[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

function centroid(geom: PolygonFeature['geometry']): { lat: number; lng: number } {
  // Cheap centroid: bounding-box midpoint. Precise enough for "where is this
  // neighborhood roughly". For ranking we only use centroids as fallback search
  // centers when the user hasn't shared coords.
  const coords: number[][] = [];
  if (geom.type === 'Polygon') {
    coords.push(...(geom.coordinates as number[][][])[0]);
  } else {
    for (const poly of geom.coordinates as number[][][][]) coords.push(...poly[0]);
  }
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
}

function featureToMatch(feat: PolygonFeature, idField: string, nameField: string): NeighborhoodMatch {
  return {
    id: String(feat.properties[idField] ?? feat.properties.NTACode ?? feat.properties.AREA_NUMBE),
    name: String(feat.properties[nameField] ?? feat.properties.NTAName ?? feat.properties.COMMUNITY ?? 'unknown'),
    centroid: centroid(feat.geometry),
  };
}

export function lookupNyc(lat: number, lng: number): NeighborhoodMatch | null {
  const fc = getNyc();
  if (!fc) return null;
  for (const feat of fc.features) {
    if (pointInPolygon([lng, lat], feat.geometry)) {
      return featureToMatch(feat, 'NTACode', 'NTAName');
    }
  }
  return null;
}

export function lookupChicago(lat: number, lng: number): NeighborhoodMatch | null {
  const fc = getChicago();
  if (!fc) return null;
  for (const feat of fc.features) {
    if (pointInPolygon([lng, lat], feat.geometry)) {
      return featureToMatch(feat, 'AREA_NUMBE', 'COMMUNITY');
    }
  }
  return null;
}

export function lookupByCity(city: string, lat: number, lng: number): NeighborhoodMatch | null {
  if (city === 'NYC') return lookupNyc(lat, lng);
  if (city === 'Chicago') return lookupChicago(lat, lng);
  return null;
}

/** All neighborhoods for a city — used to seed the diversity hard quotas. */
export function listNeighborhoods(city: string): NeighborhoodMatch[] {
  const fc = city === 'NYC' ? getNyc() : city === 'Chicago' ? getChicago() : null;
  if (!fc) return [];
  return fc.features.map((f) =>
    city === 'NYC'
      ? featureToMatch(f, 'NTACode', 'NTAName')
      : featureToMatch(f, 'AREA_NUMBE', 'COMMUNITY'),
  );
}
