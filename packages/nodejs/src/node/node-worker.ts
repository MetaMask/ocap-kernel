import 'ses';
import '@endo/eventual-send/shim.js';

import { write } from 'fs';
import { parentPort, isMainThread } from 'worker_threads';
import type { MessagePort as WorkerPort } from 'worker_threads';

import type { Mode } from './comms';

try {
  lockdown();
  console.debug('LOCKDOWN COMPLETED');
} catch (problem: unknown) {
  console.error('LOCKDOWN PROBLEM', problem);
}

// import { NodeWorkerDuplexStream } from '@ocap/streams';
const mode = process.env.COMMS as Mode;
console.debug('hello,', mode);

/*
try {
  await import('../env/endoify.js');
} catch (problem: unknown) {
  console.debug('IMPORT PROBLEM:', problem);
}
*/
/*
try {
  //await import('@ocap/shims');
  const { NodeWorkerDuplexStream } = await import('@ocap/streams');
} catch (problem: unknown) {
  console.debug('IMPORT PROBLEM:', problem);
}
*/

console.log(isMainThread ? `I'M THE MAIN THREAD!` : 'Just a child thread');

if (!parentPort) {
  process.exit(1);
}

main(process.env.COMMS as Mode, parentPort).catch(console.error);

/**
 *
 * @param mode
 * @param port
 */
async function main(mode: Mode, port: WorkerPort) {
  try {
    const comms = (await import('./comms.js'))[mode];
    await comms(port);
  } catch (problem: unknown) {
    console.error('import problem:', problem);
  }
}
