import '@ocap/shims/endoify';

import { VatAlreadyExistsError } from 'src/errors/VatAlreadyExistsError.js';
import { describe, it, expect } from 'vitest';

import { marshalError } from './marshalError.js';
import { unmarshalError } from './unmarshalError.js';

describe('marshal', () => {
  it('should round trip a thrown error', async () => {
    const thrown = new VatAlreadyExistsError('v123');
    const marshaled = marshalError(thrown);
    const received = unmarshalError(marshaled);
    expect(received).toStrictEqual(thrown);
  });
});
