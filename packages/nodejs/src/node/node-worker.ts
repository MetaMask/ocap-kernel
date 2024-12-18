import '@ocap/shims/endoify';
import { parentPort } from 'worker_threads';

import type { Mode } from './comms.js';

if (!parentPort) {
  throw new Error(
    'expected to be run in a node worker with parentPort defined',
  );
}

const comms = await import('./comms.js');
// eslint-disable-next-line n/no-process-env
comms[process.env.COMMS as Mode](parentPort).catch(console.error);
