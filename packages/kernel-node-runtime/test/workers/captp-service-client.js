// @ts-check

import '@metamask/kernel-shims/endoify-node';

import { makeCapTP } from '@endo/captp';
import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils';
import { parentPort } from 'node:worker_threads';

if (!parentPort) {
  throw new Error('Expected to run as a Node.js worker thread');
}

const port = parentPort;

const READY_SIGNAL = 'captp-service-client:ready';

const { dispatch, getBootstrap } = makeCapTP(
  'service-client',
  (message) => port.postMessage(message),
  undefined,
);

port.on('message', (message) => {
  dispatch(message);
});

const testExo = makeDefaultExo('testExo', {
  doSomething(left, right) {
    return left + right;
  },
});

async function main() {
  const kernel = await getBootstrap();
  await E(kernel).registerKernelServiceObject('testService', testExo);
  port.postMessage(READY_SIGNAL);
}

main().catch((error) => {
  throw error;
});
