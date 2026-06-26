import { describe, expect, it } from 'vitest';

import { makeVolumeProfile, parseQuantity } from './volume-pricing.ts';
import type { VolumeTier } from './volume-pricing.ts';

describe('parseQuantity', () => {
  it.each([
    ['15-unit prototype batch', 100, 15],
    ['Manufacturing run of 5,000 units for production', 100, 5_000],
    ['10 units', 100, 10],
    ['produce 1000 units to fulfil orders', 100, 1_000],
    ['nothing about quantity in this brief', 100, 100],
    ['empty', 42, 42],
    ['', 42, 42],
    // Two quantity hints — picks the first encountered.
    ['15 units for the trial run with up to 100 units later', 1, 15],
  ])('parses "%s" → %i (default %i)', (brief, defaultQty, expected) => {
    expect(parseQuantity(brief, defaultQty)).toBe(expected);
  });
});

describe('makeVolumeProfile', () => {
  const cases: {
    qty: number;
    tier: VolumeTier;
    modality: 'SLA' | 'injection-molded';
  }[] = [
    { qty: 1, tier: 'prototype', modality: 'SLA' },
    { qty: 15, tier: 'prototype', modality: 'SLA' },
    { qty: 49, tier: 'prototype', modality: 'SLA' },
    { qty: 50, tier: 'small-batch', modality: 'SLA' },
    { qty: 499, tier: 'small-batch', modality: 'SLA' },
    { qty: 500, tier: 'medium-volume', modality: 'injection-molded' },
    { qty: 4_999, tier: 'medium-volume', modality: 'injection-molded' },
    { qty: 5_000, tier: 'production', modality: 'injection-molded' },
    { qty: 50_000, tier: 'production', modality: 'injection-molded' },
  ];

  it.each(cases)(
    'classifies qty=$qty as tier=$tier',
    ({ qty, tier, modality }) => {
      const profile = makeVolumeProfile(qty);
      expect(profile.tier).toBe(tier);
      expect(profile.enclosureModality).toBe(modality);
      expect(profile.quantity).toBe(qty);
    },
  );

  it('component cost drops monotonically across tiers', () => {
    const proto = makeVolumeProfile(15);
    const small = makeVolumeProfile(100);
    const medium = makeVolumeProfile(1_000);
    const prod = makeVolumeProfile(10_000);
    expect(proto.componentMultiplier).toBeGreaterThan(
      small.componentMultiplier,
    );
    expect(small.componentMultiplier).toBeGreaterThan(
      medium.componentMultiplier,
    );
    expect(medium.componentMultiplier).toBeGreaterThan(
      prod.componentMultiplier,
    );
  });

  it('per-unit enclosure cost drops sharply on the SLA→IM transition', () => {
    const sla = makeVolumeProfile(499);
    const im = makeVolumeProfile(500);
    expect(sla.enclosureModality).toBe('SLA');
    expect(im.enclosureModality).toBe('injection-molded');
    expect(im.enclosureUnitUsd).toBeLessThan(sla.enclosureUnitUsd / 2);
  });
});
