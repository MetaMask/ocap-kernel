import { makeCapTP } from '@endo/captp';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import type {
  StreamEnvelope,
  CapTpMessage,
  VatMessage,
  WrappedVatMessage,
} from '@ocap/streams';
import {
  receiveMessagePort,
  makeMessagePortStreamPair,
  makeStreamEnvelopeHandler,
  Command,
  wrapCapTp,
  wrapStreamCommand,
} from '@ocap/streams';

const defaultCompartment = new Compartment({ URL });

main().catch(console.error);

/**
 * The main function for the iframe.
 */
async function main(): Promise<void> {
  const port = await receiveMessagePort();
  const streams = makeMessagePortStreamPair<StreamEnvelope>(port);
  let capTp: ReturnType<typeof makeCapTP> | undefined;

  const streamEnvelopeHandler = makeStreamEnvelopeHandler(
    {
      command: handleMessage,
      capTp: async (content) => capTp?.dispatch(content),
    },
    (reason, value) => {
      throw new Error(`[vat IFRAME] ${reason} ${stringifyResult(value)}`);
    },
  );

  for await (const rawMessage of streams.reader) {
    console.debug('iframe received message', rawMessage);
    await streamEnvelopeHandler.handle(rawMessage);
  }

  await streams.return();
  throw new Error('MessagePortReader ended unexpectedly.');

  /**
   * Handle a message from the parent window.
   *
   * @param wrappedMessage - The wrapped message to handle.
   * @param wrappedMessage.id - The id of the message.
   * @param wrappedMessage.message - The message to handle.
   */
  async function handleMessage({
    id,
    message,
  }: WrappedVatMessage): Promise<void> {
    switch (message.type) {
      case Command.Evaluate: {
        if (typeof message.data !== 'string') {
          console.error(
            'iframe received message with unexpected data type',
            // @ts-expect-error The type of `message.data` is `never`, but this could happen at runtime.
            stringifyResult(message.data),
          );
          return;
        }
        const result = safelyEvaluate(message.data);
        await replyToMessage(id, {
          type: Command.Evaluate,
          data: stringifyResult(result),
        });
        break;
      }
      case Command.CapTpInit: {
        const bootstrap = makeExo(
          'TheGreatFrangooly',
          M.interface('TheGreatFrangooly', {}, { defaultGuards: 'passable' }),
          { whatIsTheGreatFrangooly: () => 'Crowned with Chaos' },
        );

        capTp = makeCapTP(
          'iframe',
          async (content: unknown) =>
            streams.writer.next(wrapCapTp(content as CapTpMessage)),
          bootstrap,
        );
        await replyToMessage(id, { type: Command.CapTpInit, data: null });
        break;
      }
      case Command.Ping:
        await replyToMessage(id, { type: Command.Ping, data: 'pong' });
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
   *
   * @param id - The id of the message to reply to.
   * @param message - The message to reply with.
   */
  async function replyToMessage(
    id: string,
    message: VatMessage,
  ): Promise<void> {
    await streams.writer.next(wrapStreamCommand({ id, message }));
  }

  /**
   * Evaluate a string in the default compartment.
   *
   * @param source - The source string to evaluate.
   * @returns The result of the evaluation, or an error message.
   */
  function safelyEvaluate(source: string): string {
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
   *
   * @param result - The result to stringify.
   * @returns The stringified result.
   */
  function stringifyResult(result: unknown): string {
    try {
      return JSON.stringify(result, null, 2);
    } catch {
      return String(result);
    }
  }
}
