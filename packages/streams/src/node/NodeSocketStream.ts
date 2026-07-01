/**
 * @module Node Socket streams
 */

import {
  BaseDuplexStream,
  makeDuplexStreamInputValidator,
} from '../BaseDuplexStream.ts';
import type {
  BaseReaderArgs,
  BaseWriterArgs,
  ValidateInput,
} from '../BaseStream.ts';
import { BaseReader, BaseWriter } from '../BaseStream.ts';
import { makeStreamDoneSignal, makeStreamErrorSignal } from '../utils.ts';
import type { Dispatchable } from '../utils.ts';

/**
 * A duck-typed subset of `net.Socket` used by the stream implementations.
 * Using a structural type avoids importing from `node:net` in a package that
 * targets both Node and browser environments.
 */
export type NetSocket = {
  on(event: 'data', listener: (chunk: unknown) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  write(
    data: string,
    callback?: (error: Error | null | undefined) => void,
  ): unknown;
  destroy(): void;
};

/**
 * A readable stream over a {@link NetSocket}.
 *
 * Buffers incoming bytes, splits on newlines, and JSON-parses each line before
 * forwarding it to the base reader's receive-input pipeline.
 *
 * @see {@link NodeSocketWriter} for the corresponding writable stream.
 */
export class NodeSocketReader<Read> extends BaseReader<Read> {
  /**
   * Constructs a new {@link NodeSocketReader}.
   *
   * @param socket - The socket to read from.
   * @param options - Options bag for configuring the reader.
   * @param options.validateInput - A function that validates input from the transport.
   * @param options.onEnd - A function that is called when the stream ends.
   */
  constructor(
    socket: NetSocket,
    { validateInput, onEnd }: BaseReaderArgs<Read> = {},
  ) {
    super({ validateInput, onEnd: async () => await onEnd?.() });
    const receiveInput = super.getReceiveInput();

    let buffer = '';

    socket.on('data', (chunk: unknown) => {
      buffer += String(chunk);
      let idx: number;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.length > 0) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(line);
          } catch (error) {
            this.throw(
              error instanceof Error ? error : new Error(String(error)),
            ).catch(() => undefined);
            return;
          }
          receiveInput(parsed).catch(async (error: Error) => this.throw(error));
        }
      }
    });

    socket.on('end', () => {
      receiveInput(makeStreamDoneSignal()).catch(() => undefined);
    });

    socket.on('error', (error: Error) => {
      // eslint-disable-next-line promise/no-promise-in-callback
      receiveInput(makeStreamErrorSignal(error)).catch(() => undefined);
    });

    harden(this);
  }
}
harden(NodeSocketReader);

/**
 * A writable stream over a {@link NetSocket}.
 *
 * JSON-serializes each value and writes it as a newline-delimited line.
 *
 * @see {@link NodeSocketReader} for the corresponding readable stream.
 */
export class NodeSocketWriter<Write> extends BaseWriter<Write> {
  /**
   * Constructs a new {@link NodeSocketWriter}.
   *
   * @param socket - The socket to write to.
   * @param options - Options bag for configuring the writer.
   * @param options.name - The name of the stream, for logging purposes.
   * @param options.onEnd - A function that is called when the stream ends.
   */
  constructor(
    socket: NetSocket,
    { name, onEnd }: Omit<BaseWriterArgs<Write>, 'onDispatch'> = {},
  ) {
    super({
      name,
      onDispatch: async (value: Dispatchable<Write>) =>
        new Promise<void>((resolve, reject) => {
          socket.write(`${JSON.stringify(value)}\n`, (error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        }),
      onEnd: async () => {
        await onEnd?.();
        socket.destroy();
      },
    });
    harden(this);
  }
}
harden(NodeSocketWriter);

/**
 * A duplex stream over a Node socket.
 */
export class NodeSocketDuplexStream<
  Read,
  Write = Read,
> extends BaseDuplexStream<
  Read,
  NodeSocketReader<Read>,
  Write,
  NodeSocketWriter<Write>
> {
  /**
   * Constructs a new {@link NodeSocketDuplexStream}.
   *
   * @param socket - The socket for bidirectional communication.
   * @param validateInput - A function that validates input from the transport.
   */
  constructor(socket: NetSocket, validateInput?: ValidateInput<Read>) {
    let writer: NodeSocketWriter<Write>; // eslint-disable-line prefer-const
    const reader = new NodeSocketReader<Read>(socket, {
      name: 'NodeSocketDuplexStream',
      validateInput: makeDuplexStreamInputValidator(validateInput),
      onEnd: async () => {
        await writer.return();
      },
    });
    writer = new NodeSocketWriter<Write>(socket, {
      name: 'NodeSocketDuplexStream',
      onEnd: async () => {
        await reader.return();
      },
    });
    super(reader, writer);
  }

  /**
   * Creates and synchronizes a new {@link NodeSocketDuplexStream}.
   *
   * @param socket - The socket for bidirectional communication.
   * @param validateInput - A function that validates input from the transport.
   * @returns A synchronized duplex stream.
   */
  static async make<Read, Write = Read>(
    socket: NetSocket,
    validateInput?: ValidateInput<Read>,
  ): Promise<NodeSocketDuplexStream<Read, Write>> {
    const stream = new NodeSocketDuplexStream<Read, Write>(
      socket,
      validateInput,
    );
    await stream.synchronize();
    return stream;
  }
}
harden(NodeSocketDuplexStream);
