import { waitUntilQuiescent } from '@metamask/kernel-utils';
import type { JsonRpcCall, JsonRpcMessage } from '@metamask/kernel-utils';
import { NodeWorkerDuplexStream } from '@metamask/streams';
import type { DuplexStream } from '@metamask/streams';
import { Worker as NodeWorker } from 'node:worker_threads';
import { describe, it, expect, vi } from 'vitest';

import { Logger } from '../src/logger.ts';
import { splitLoggerStream } from '../src/stream.ts';
import type { LogMessage } from '../src/stream.ts';

const makeWorker = (name: string) =>
  new NodeWorker(new URL(`./workers/${name}.js`, import.meta.url));

describe('ipc', () => {
  it('delivery over the underlying duplex stream', async () => {
    const worker = makeWorker('underlying');
    const stream = await NodeWorkerDuplexStream.make(worker);

    const { value } = await stream.next();
    expect(value).toBeDefined();

    const { method, params } = value as JsonRpcCall;
    expect(method).toBe('notify');
    expect(params).toStrictEqual(['Hello, world!']);
  });

  it('delivery over a single stream via streamTransport and injectStream', async () => {
    const worker = makeWorker('logger');
    const stream = await NodeWorkerDuplexStream.make(worker);

    const mockTransport = vi.fn();
    const logger = new Logger({ transports: [mockTransport] });
    logger.injectStream(stream as unknown as DuplexStream<LogMessage>);

    await waitUntilQuiescent(1000);
    expect(mockTransport).toHaveBeenCalledWith({
      level: 'debug',
      message: 'Hello, world!',
      tags: ['test'],
      data: [],
    });
  });

  it('delivery over a split stream via streamTransport and injectStream', async () => {
    const worker = makeWorker('split');
    const stream = await NodeWorkerDuplexStream.make(worker);
    const { loggerStream } = splitLoggerStream(
      stream as DuplexStream<JsonRpcMessage>,
    );

    const mockTransport = vi.fn();
    const logger = new Logger({ transports: [mockTransport] });
    logger.injectStream(loggerStream as unknown as DuplexStream<LogMessage>);

    await waitUntilQuiescent(1000);
    expect(mockTransport).toHaveBeenCalledWith({
      level: 'debug',
      message: 'Hello, world!',
      tags: ['test'],
      data: [],
    });
  });
});
