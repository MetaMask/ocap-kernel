import { describe, it, expect } from 'vitest';

import { isConnection } from './connection.js';
import { mockConnection } from '../test/mock-connection.js';

describe('isConnection', () => {
  it.each`
    connection
    ${mockConnection}
  `('returns true for valid connections: $connection', ({ connection }) => {
    expect(isConnection(connection)).toBe(true);
  });

  it.each`
    value
    ${null}
    ${new MessageChannel().port1}
  `('returns false for invalid connections: $value', ({ value }) => {
    expect(isConnection(value)).toBe(false);
  });
});
