import { describe, expect, it } from 'vitest';

import type { Foo } from './envelope-test-fixtures.js';
import {
  barContent,
  fooContent,
  inferBoolean,
  inferNumber,
  inferString,
  isStreamEnvelope,
  Label,
  streamEnveloper,
} from './envelope-test-fixtures.js';

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

  /* eslint-disable @typescript-eslint/no-unused-expressions */
  // eslint-disable-next-line vitest/expect-expect
  it('provides proper typescript inferences', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value: any = null;
    // eslint-disable-next-line vitest/no-conditional-in-test
    if (isStreamEnvelope(value)) {
      switch (value.label) {
        case Label.Foo:
          inferNumber(value.content.a);
          // @ts-expect-error a is not a string
          inferString(value.content.a);
          // @ts-expect-error b is not a number
          inferNumber(value.content.b);
          inferString(value.content.b);
          // @ts-expect-error c is undefined
          value.content.c;
          break;
        case Label.Bar:
          // @ts-expect-error a is undefined
          value.content.a;
          // @ts-expect-error a is undefined
          value.content.b;
          inferBoolean(value.content.c);
          break;
        default: // unreachable
          // @ts-expect-error label options are exhausted
          value.label;
      }
    }
  });
  /* eslint-enable @typescript-eslint/no-unused-expressions */
});
