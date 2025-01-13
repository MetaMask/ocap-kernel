// eslint-disable-next-line spaced-comment
/// <reference types="vite/client" />

import 'ses';
import '@endo/eventual-send/shim.js';

const isDev = import.meta.env.MODE === 'test';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: isDev ? 'unsafe-debug' : 'unsafe',
  mathTaming: 'unsafe',
  dateTaming: 'unsafe',
  overrideTaming: 'severe',
  domainTaming: 'unsafe',
  stackFiltering: isDev ? 'verbose' : 'concise',
});
