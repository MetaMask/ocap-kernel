import { receiveMessagePort, makeMessagePortStreamPair } from '@ocap/streams';

import type { WrappedIframeMessage } from './shared.js';
import { Command, isWrappedIframeMessage } from './shared.js';

const defaultCompartment = new Compartment({ URL });

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main() {
  const port = await receiveMessagePort();
  const streams = makeMessagePortStreamPair<WrappedIframeMessage>(port);

  for await (const wrappedMessage of streams.reader) {
    console.debug('iframe received message', wrappedMessage);

    if (!isWrappedIframeMessage(wrappedMessage)) {
      console.error(
        'iframe received message with unexpected format',
        wrappedMessage,
      );
      return;
    }

    const { id, message } = wrappedMessage;

    switch (message.type) {
      case Command.Evaluate: {
        if (typeof message.data !== 'string') {
          console.error(
            'iframe received message with unexpected data type',
            message.data,
          );
          return;
        }
        const result = safelyEvaluate(message.data);
        await reply(id, Command.Evaluate, stringifyResult(result));
        break;
      }
      case Command.Ping:
        await reply(id, Command.Ping, 'pong');
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `iframe received unexpected message type: "${message.type}"`,
        );
    }
  }

  await streams.return();
  throw new Error('MessagePortReader ended unexpectedly.');

  /**
   * Reply to the parent window.
   * @param id - The id of the message to reply to.
   * @param messageType - The message type.
   * @param data - The message data.
   */
  async function reply(id: string, messageType: Command, data: string) {
    await streams.writer.next({ id, message: { type: messageType, data } });
  }

  /**
   * Evaluate a string in the default compartment.
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  function safelyEvaluate(source: string) {
    try {
      return defaultCompartment.evaluate(source);
    } catch (error) {
      if (error instanceof Error) {
        return `Error: ${error.message}`;
      }
      return `Error: Unknown error during evaluation.`;
    }
  }

  /**
   * Stringify an evaluation result.
   * @param result - The result to stringify.
   * @returns The stringified result.
   */
  function stringifyResult(result: unknown) {
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
