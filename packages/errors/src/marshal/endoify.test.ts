import '@ocap/shims/endoify';

import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.js';
import { unmarshalError } from './unmarshalError.js';
import { VatAlreadyExistsError } from '../errors/VatAlreadyExistsError.js';

describe('marshal', () => {
  it('should round trip a thrown error', async () => {
    const thrown = new VatAlreadyExistsError('v123');
    const marshaled = marshalError(thrown);
    const received = unmarshalError(marshaled);
    expect(received).toStrictEqual(thrown);
  });
});
