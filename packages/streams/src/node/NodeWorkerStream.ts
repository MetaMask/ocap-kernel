/**
 * @module Node Worker streams
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
import type { Dispatchable } from '../utils.ts';

export type OnMessage = (message: unknown) => void;

export type NodePort = {
  on: (event: 'message', listener: OnMessage) => void;
  postMessage: (message: unknown) => void;
};

/**
 * A readable stream over a {@link NodePort}.
 *
 * @see
 * - {@link NodeWorkerWriter} for the corresponding writable stream.
 * - The module-level documentation for more details.
 */
export class NodeWorkerReader<Read> extends BaseReader<Read> {
  /**
   * Constructs a new {@link NodeWorkerReader}.
   *
   * @param port - The node worker port to read from.
   * @param options - Options bag for configuring the reader.
   * @param options.validateInput - A function that validates input from the transport.
   * @param options.onEnd - A function that is called when the stream ends.
   */
  constructor(
    port: NodePort,
    { validateInput, onEnd }: BaseReaderArgs<Read> = {},
  ) {
    super({
      validateInput,
      onEnd: async () => await onEnd?.(),
    });

    const receiveInput = super.getReceiveInput();
    port.on('message', (data) => {
      receiveInput(data).catch(async (error) => this.throw(error));
    });
    harden(this);
  }
}
harden(NodeWorkerReader);

/**
 * A writable stream over a {@link NodeWorker}.
 *
 * @see
 * - {@link NodeWorkerReader} for the corresponding readable stream.
 * - The module-level documentation for more details.
 */
export class NodeWorkerWriter<Write> extends BaseWriter<Write> {
  /**
   * Constructs a new {@link NodeWorkerWriter}.
   *
   * @param port - The node worker port to write to.
   * @param options - Options bag for configuring the writer.
   * @param options.name - The name of the stream, for logging purposes.
   * @param options.onEnd - A function that is called when the stream ends.
   */
  constructor(
    port: NodePort,
    { name, onEnd }: Omit<BaseWriterArgs<Write>, 'onDispatch'> = {},
  ) {
    super({
      name,
      onDispatch: (value: Dispatchable<Write>) => port.postMessage(value),
      onEnd: async () => {
        await onEnd?.();
      },
    });
    harden(this);
  }
}
harden(NodeWorkerWriter);

/**
 * A duplex stream over a Node worker port.
 */
export class NodeWorkerDuplexStream<
  Read,
  Write = Read,
> extends BaseDuplexStream<
  Read,
  NodeWorkerReader<Read>,
  Write,
  NodeWorkerWriter<Write>
> {
  /**
   * Constructs a new {@link NodeWorkerDuplexStream}.
   *
   * @param port - The node worker port for bidirectional communication.
   * @param validateInput - A function that validates input from the transport.
   */
  constructor(port: NodePort, validateInput?: ValidateInput<Read>) {
    let writer: NodeWorkerWriter<Write>; // eslint-disable-line prefer-const
    const reader = new NodeWorkerReader<Read>(port, {
      name: 'NodeWorkerDuplexStream',
      validateInput: makeDuplexStreamInputValidator(validateInput),
      onEnd: async () => {
        await writer.return();
      },
    });
    writer = new NodeWorkerWriter<Write>(port, {
      name: 'NodeWorkerDuplexStream',
      onEnd: async () => {
        await reader.return();
      },
    });
    super(reader, writer);
  }

  /**
   * Creates and synchronizes a new {@link NodeWorkerDuplexStream}.
   *
   * @param port - The node worker port for bidirectional communication.
   * @param validateInput - A function that validates input from the transport.
   * @returns A synchronized duplex stream.
   */
  static async make<Read, Write = Read>(
    port: NodePort,
    validateInput?: ValidateInput<Read>,
  ): Promise<NodeWorkerDuplexStream<Read, Write>> {
    const stream = new NodeWorkerDuplexStream<Read, Write>(port, validateInput);
    await stream.synchronize();
    return stream;
  }
}
harden(NodeWorkerDuplexStream);
