import { resolve } from 'node:path';

import type { ModuleRecord } from '../types.ts';

// To remain hardcoded until we converge on an endowment specification format.
export default {
  imports: [],
  exports: ['resolve'],
  execute: (moduleExports: Record<string, unknown>) => {
    // We allow resolution of paths, sure. This does leak things like the
    // name of `~` and such, but since 'node:fs' is restricted, it is as bad
    // as the decision to store protected information in the directory
    // structure itself, rather than within the files residing therein.
    moduleExports.resolve = resolve;
    harden(moduleExports);
  },
} as ModuleRecord;
