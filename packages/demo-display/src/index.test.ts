import { describe, expect, it } from 'vitest';

import * as displayApi from './index.ts';

describe('index', () => {
  it('re-exports the demo-display surface', () => {
    expect(Object.keys(displayApi).sort()).toStrictEqual([
      'loadConfig',
      'makeDaemonCaller',
      'makeEventLog',
      'startMatcherPoller',
      'startServer',
    ]);
  });
});
