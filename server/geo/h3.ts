// H3 spatial-index wrapper.
// Resolution 9 ≈ 174m hex (~city block). Resolution 7 ≈ 1.2km (~neighborhood-ish).
// Used for: (a) dedupe by (name, h3_res9) so two venues sharing a name in
// different blocks stay distinct; (b) coarse "near here" lookups; (c) per-cell
// quotas in diversity post-pass.

import { latLngToCell, cellToLatLng, cellToParent, gridDisk } from 'h3-js';

export const H3_RES_BLOCK = 9; // ~174m
export const H3_RES_NEIGHBORHOOD = 7; // ~1.2km

export function h3Cell(lat: number, lng: number, resolution = H3_RES_BLOCK): string {
  return latLngToCell(lat, lng, resolution);
}

export function h3Center(cell: string): { lat: number; lng: number } {
  const [lat, lng] = cellToLatLng(cell);
  return { lat, lng };
}

export function h3Coarsen(cell: string, resolution = H3_RES_NEIGHBORHOOD): string {
  return cellToParent(cell, resolution);
}

/** k-ring of neighboring cells at the same resolution. */
export function h3Neighbors(cell: string, k = 1): string[] {
  return gridDisk(cell, k);
}
