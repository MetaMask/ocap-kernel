import '@ocap/shims/endoify';
import {
  marshalError,
  unmarshalError,
  VatAlreadyExistsError,
} from '@ocap/errors';
import { describe, it, expect } from 'vitest';

describe('marshal', () => {
  it('should round trip a thrown error', async () => {
    const thrown = new VatAlreadyExistsError('v123');
    const marshaled = marshalError(thrown);
    const received = unmarshalError(marshaled);

    expect(received).toStrictEqual(thrown);
  });
});
