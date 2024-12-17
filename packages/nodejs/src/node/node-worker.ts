import 'ses';
import '@endo/eventual-send/shim.js';

try {
  lockdown();
  console.debug('LOCKDOWN COMPLETED');
} catch (problem: unknown) {
  console.error('LOCKDOWN PROBLEM', problem);
}

import { parentPort, isMainThread } from "worker_threads";
import type { MessagePort as WorkerPort } from "worker_threads";
import { env } from "node:process";
import { write } from 'fs';
import { exit } from 'process';
import type { Mode } from './comms';

// import { NodeWorkerDuplexStream } from '@ocap/streams';

console.debug('hello,', process.env.COMMS);

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
const mode = env.COMMS as Mode;

console.log('MODE:', mode);

console.log(isMainThread
  ? `I'M THE MAIN THREAD!`
  : 'Just a child thread',
);

if (!parentPort) {
  process.exit(1);
}

main(env.COMMS as Mode, parentPort).catch(console.error);

async function main(mode: Mode, port: WorkerPort) {
  try {
    const comms = (await import('./comms.js'))[mode];
    await comms(port);
  } catch (problem: unknown) {
    console.error('import problem:', problem);
  }
}
