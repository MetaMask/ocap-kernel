import { describe, expect, it } from 'vitest';

import { makeStreamEnvelopeKit } from './envelope-kit.js';
import type {
  Bar,
  ContentMap,
  Foo,
  labels,
} from '../test/envelope-kit-fixtures.js';

describe('makeStreamEnvelopeKit', () => {
  it.each`
    property
    ${'streamEnveloper'}
    ${'isStreamEnvelope'}
    ${'makeStreamEnvelopeHandler'}
  `('has the expected property: $property', ({ property }) => {
    const streamEnvelopeKit = makeStreamEnvelopeKit<typeof labels, ContentMap>({
      foo: (value: unknown): value is Foo => true,
      bar: (value: unknown): value is Bar => true,
    });
    expect(streamEnvelopeKit).toHaveProperty(property);
  });
});
