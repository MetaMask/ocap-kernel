import { describe, expect, it } from 'vitest';

import { platformConfigStruct } from './index.ts';

describe('platformConfigStruct', () => {
  it.each([
    { name: 'empty config', config: {} },
    { name: 'config with fetch capability', config: { fetch: {} } },
    { name: 'config with fs capability', config: { fs: { rootDir: '/tmp' } } },
  ])('validates $name', ({ config }) => {
    expect(() => platformConfigStruct.create(config)).not.toThrow();
  });
});
