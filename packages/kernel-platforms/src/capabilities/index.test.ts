import { describe, expect, it } from 'vitest';

import { platformConfigStruct } from './index.ts';

describe('platformConfigStruct', () => {
  it('validates empty config', () => {
    const config = {};
    expect(() => platformConfigStruct.create(config)).not.toThrow();
  });

  it('validates config with fetch capability', () => {
    const config = { fetch: {} };
    expect(() => platformConfigStruct.create(config)).not.toThrow();
  });

  it('validates config with fs capability', () => {
    const config = { fs: { rootDir: '/tmp' } };
    expect(() => platformConfigStruct.create(config)).not.toThrow();
  });
});
