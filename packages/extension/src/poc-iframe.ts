import { receiveMessagePort, } from '@ocap/streams';

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort();
  port.postMessage('the angel from my nightmare...');
}