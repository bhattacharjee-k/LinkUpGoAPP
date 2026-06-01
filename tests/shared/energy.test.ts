import { describe, expect, it } from 'vitest';
import {
  ENERGY_BANDS,
  aggregateEnergy,
  bandForNii,
  isHighEnergy,
  nii,
  niiCenterForLevel,
  niiRangeForLevel,
  toEnergyLevel,
} from '@shared/energy';

describe('energy bands', () => {
  it('maps boundary values to canonical bands', () => {
    expect(bandForNii(0)).toBe('Chill');
    expect(bandForNii(24.99)).toBe('Chill');
    expect(bandForNii(25)).toBe('Vibey');
    expect(bandForNii(50)).toBe('Going out');
    expect(bandForNii(78)).toBe('Full send');
    expect(bandForNii(100)).toBe('Full send');
  });

  it('exposes ranges and centers for each level', () => {
    expect(niiRangeForLevel('Chill')).toEqual({ lo: 0, hi: 25 });
    expect(niiRangeForLevel('Vibey')).toEqual({ lo: 25, hi: 50 });
    expect(niiRangeForLevel('Going out')).toEqual({ lo: 50, hi: 78 });
    expect(niiRangeForLevel('Full send')).toEqual({ lo: 78, hi: 100 });
    expect(niiCenterForLevel('Going out')).toBe(64);
  });

  it('keeps rank order canonical', () => {
    expect(ENERGY_BANDS.Chill.rank).toBe(1);
    expect(ENERGY_BANDS.Vibey.rank).toBe(2);
    expect(ENERGY_BANDS['Going out'].rank).toBe(3);
    expect(ENERGY_BANDS['Full send'].rank).toBe(4);
  });
});

describe('nii', () => {
  it('computes known weighted vectors', () => {
    expect(nii({ spend: 0, lateness: 0, intensity: 0, crowd: 0 })).toBe(0);
    expect(nii({ spend: 1, lateness: 1, intensity: 1, crowd: 1 })).toBe(100);
    expect(nii({ spend: 0.5, lateness: 0.25, intensity: 0.75, crowd: 0.5 })).toBeCloseTo(50);
  });

  it('clamps feature inputs to the 0-1 range', () => {
    expect(nii({ spend: 2, lateness: -1, intensity: 0.5, crowd: 0.5 })).toBeCloseTo(45);
  });
});

describe('aggregateEnergy', () => {
  it('uses ordinal median and min/max spread for odd groups', () => {
    expect(aggregateEnergy(['Chill', 'Full send', 'Going out'])).toEqual({
      target: 'Going out',
      spread: ['Chill', 'Full send'],
    });
  });

  it('uses the lower ordinal median for even groups', () => {
    expect(aggregateEnergy(['Chill', 'Vibey', 'Going out', 'Full send'])).toEqual({
      target: 'Vibey',
      spread: ['Chill', 'Full send'],
    });
  });

  it('handles ties without averaging into a non-selected level', () => {
    expect(aggregateEnergy(['Vibey', 'Vibey', 'Full send', 'Full send'])).toEqual({
      target: 'Vibey',
      spread: ['Vibey', 'Full send'],
    });
  });

  it('defaults empty input to Vibey', () => {
    expect(aggregateEnergy([])).toEqual({
      target: 'Vibey',
      spread: ['Vibey', 'Vibey'],
    });
  });
});

describe('energy regression helpers', () => {
  it('keeps Going out and Full send on the canonical scale', () => {
    const oldBrokenScale = ['Chill', 'Vibey', 'Hype'];
    expect(oldBrokenScale.indexOf('Going out')).toBe(-1);
    expect(oldBrokenScale.indexOf('Full send')).toBe(-1);

    expect(toEnergyLevel('Going out')).toBe('Going out');
    expect(toEnergyLevel('Full send')).toBe('Full send');
    expect(aggregateEnergy(['Going out', 'Full send']).target).toBe('Going out');
  });

  it('preserves high-energy parity for runtime call-sites', () => {
    expect(isHighEnergy('Chill')).toBe(false);
    expect(isHighEnergy('Vibey')).toBe(false);
    expect(isHighEnergy('Going out')).toBe(true);
    expect(isHighEnergy('Full send')).toBe(true);
    expect(isHighEnergy('Hype')).toBe(false);
  });
});
