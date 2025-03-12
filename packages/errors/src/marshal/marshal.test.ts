import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.ts';
import { unmarshalError } from './unmarshalError.ts';
import { VatAlreadyExistsError } from '../errors/VatAlreadyExistsError.ts';

describe('marshal', () => {
  it('should round trip a thrown error', async () => {
    const thrown = new VatAlreadyExistsError('v123');
    const marshaled = marshalError(thrown);
    const received = unmarshalError(marshaled);
    expect(received).toStrictEqual(thrown);
  });
});
