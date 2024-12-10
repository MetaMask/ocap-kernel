/**
 * @module Node Worker streams
 */

import {
  BaseDuplexStream,
  makeDuplexStreamInputValidator,
} from '../BaseDuplexStream.js';
import type {
  BaseReaderArgs,
  BaseWriterArgs,
  ValidateInput,
} from '../BaseStream.js';
import { BaseReader, BaseWriter } from '../BaseStream.js';
import {
  isMultiplexEnvelope,
  StreamMultiplexer,
} from '../StreamMultiplexer.js';
import type { Dispatchable } from '../utils.js';

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

export class NodeWorkerDuplexStream<
  Read,
  Write = Read,
> extends BaseDuplexStream<
  Read,
  NodeWorkerReader<Read>,
  Write,
  NodeWorkerWriter<Write>
> {
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

export class NodeWorkerMultiplexer extends StreamMultiplexer {
  constructor(port: NodePort, name?: string) {
    super(new NodeWorkerDuplexStream(port, isMultiplexEnvelope), name);
    harden(this);
  }
}
harden(NodeWorkerMultiplexer);
