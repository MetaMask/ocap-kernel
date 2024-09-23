import { receiveMessagePort } from '@ocap/streams';
import { delay } from '@ocap/test-utils';
import { THE_ANGEL } from './poc-constants.js';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort();

  await delay(100);

  console.log(THE_ANGEL);
  port.postMessage(THE_ANGEL);
}
