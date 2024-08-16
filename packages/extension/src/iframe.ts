import { makeCapTP } from '@endo/captp';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { receiveMessagePort, makeMessagePortStreamPair } from '@ocap/streams';

import type { StreamPayloadEnvelope, WrappedIframeMessage } from './shared.js';
import { isStreamPayloadEnvelope, Command } from './shared.js';

const defaultCompartment = new Compartment({ URL });

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main() {
  const port = await receiveMessagePort();
  const streams = makeMessagePortStreamPair<StreamPayloadEnvelope>(port);
  let capTp: ReturnType<typeof makeCapTP> | undefined;

  for await (const rawMessage of streams.reader) {
    console.debug('iframe received message', rawMessage);

    if (!isStreamPayloadEnvelope(rawMessage)) {
      console.error(
        'iframe received message with unexpected format',
        rawMessage,
      );
      return;
    }

    switch (rawMessage.label) {
      case 'capTp':
        if (capTp !== undefined) {
          capTp.dispatch(rawMessage.payload);
        }
        break;
      case 'message':
        await handleMessage(rawMessage.payload);
        break;
      /* v8 ignore next 3: Exhaustiveness check */
      default:
        // @ts-expect-error Exhaustiveness check
        throw new Error(`Unexpected message label "${rawMessage.label}".`);
    }
  }

  await streams.return();
  throw new Error('MessagePortReader ended unexpectedly.');

  /**
   * Handle a message from the parent window.
   * @param wrappedMessage - The wrapped message to handle.
   * @param wrappedMessage.id - The id of the message.
   * @param wrappedMessage.message - The message to handle.
   */
  async function handleMessage({ id, message }: WrappedIframeMessage) {
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
        await replyToMessage(id, Command.Evaluate, stringifyResult(result));
        break;
      }
      case Command.CapTpInit: {
        const bootstrap = makeExo(
          'TheGreatFrangooly',
          M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
          { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
        );

        capTp = makeCapTP(
          'iframe', // TODO
          // https://github.com/endojs/endo/issues/2412
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          async (payload: unknown) =>
            streams.writer.next({ label: 'capTp', payload }),
          bootstrap,
        );
        await replyToMessage(id, Command.CapTpInit);
        break;
      }
      case Command.Ping:
        await replyToMessage(id, Command.Ping, 'pong');
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `iframe received unexpected message type: "${message.type}"`,
        );
    }
  }

  /**
   * Reply to a message from the parent window.
   * @param id - The id of the message to reply to.
   * @param messageType - The message type.
   * @param data - The message data.
   */
  async function replyToMessage(
    id: string,
    messageType: Command,
    data: string | null = null,
  ) {
    await streams.writer.next({
      label: 'message',
      payload: { id, message: { type: messageType, data } },
    });
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
