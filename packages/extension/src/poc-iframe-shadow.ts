import { receiveMessagePort } from '@ocap/streams';
import { THE_ANGEL, THE_SHADOW } from './poc-constants.js';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  (await receiveMessagePort()).onmessage = (message: MessageEvent): void => {
    if (message.data !== THE_ANGEL) {
      return;
    }
    console.log(THE_SHADOW);
  }
}
