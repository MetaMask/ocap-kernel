import { describe, it, expect } from 'vitest';

import * as indexModule from '.';

describe('index', () => {
  it('has the expected exports', () => {
    expect(Object.keys(indexModule)).toStrictEqual(
      expect.arrayContaining([
        'MessagePortReader',
        'MessagePortWriter',
        'initializeMessageChannel',
        'receiveMessagePort',
      ]),
    );
  });
});
