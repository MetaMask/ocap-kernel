import { describe, expect, it } from 'vitest';

import type { Foo } from '../test/envelope-kit-fixtures.js';
import {
  barContent,
  fooContent,
  isStreamEnvelope,
  streamEnveloper,
} from '../test/envelope-kit-fixtures.js';

describe('isStreamEnvelope', () => {
  it.each`
    value
    ${streamEnveloper.foo.wrap(fooContent)}
    ${streamEnveloper.bar.wrap(barContent)}
  `('returns true for valid envelopes: $value', ({ value }) => {
    expect(isStreamEnvelope(value)).toBe(true);
  });

  it.each`
    value
    ${null}
    ${true}
    ${[]}
    ${{}}
    ${fooContent}
    ${{ id: '0x5012C312312' }}
    ${streamEnveloper.foo.wrap(barContent as unknown as Foo)}
  `('returns false for invalid values: $value', ({ value }) => {
    expect(isStreamEnvelope(value)).toBe(false);
  });
});
