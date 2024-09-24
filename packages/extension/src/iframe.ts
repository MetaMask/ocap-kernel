import { makeCapTP } from '@endo/captp';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { receiveMessagePort, makeMessagePortStreamPair } from '@ocap/streams';
import type {
  StreamEnvelope,
  CapTpMessage,
  Command,
  VatMessage,
} from '@ocap/utils';
import {
  CommandType,
  makeStreamEnvelopeHandler,
  wrapCapTp,
  wrapStreamCommand,
} from '@ocap/utils';

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
   * @param vatMessage - The vat message to handle.
   * @param vatMessage.id - The id of the message.
   * @param vatMessage.payload - The payload to handle.
   */
  async function handleMessage({ id, payload }: VatMessage): Promise<void> {
    switch (payload.type) {
      case CommandType.Evaluate: {
        if (typeof payload.data !== 'string') {
          console.error(
            'iframe received message with unexpected data type',
            // @ts-expect-error The type of `message.data` is `never`, but this could happen at runtime.
            stringifyResult(payload.data),
          );
          return;
        }
        const result = safelyEvaluate(payload.data);
        await replyToMessage(id, {
          type: CommandType.Evaluate,
          data: stringifyResult(result),
        });
        break;
      }
      case CommandType.CapTpInit: {
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
        await replyToMessage(id, { type: CommandType.CapTpInit, data: null });
        break;
      }
      case CommandType.Ping:
        await replyToMessage(id, { type: CommandType.Ping, data: 'pong' });
        break;
      default:
        console.error(
          // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
          `iframe received unexpected message type: "${payload.type}"`,
        );
    }
  }

  /**
   * Reply to a message from the parent window.
   *
   * @param id - The id of the message to reply to.
   * @param payload - The payload to reply with.
   */
  async function replyToMessage(id: string, payload: Command): Promise<void> {
    await streams.writer.next(wrapStreamCommand({ id, payload }));
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
