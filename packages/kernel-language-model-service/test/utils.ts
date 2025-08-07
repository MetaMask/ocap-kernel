import type { Writer } from '@metamask/streams';
import type { AbortableAsyncIterator } from 'ollama';
import { vi } from 'vitest';
import type { Mocked } from 'vitest';

export const mockStream = (): Mocked<Writer<string>> => {
  const stream: Mocked<Writer<string>> = {
    next: vi.fn().mockResolvedValue(undefined),
    return: vi.fn().mockResolvedValue(undefined),
    throw: vi.fn().mockResolvedValue(undefined),
    [Symbol.asyncIterator]: vi.fn(() => stream),
  };
  return stream;
};

export const makeMockAbortableAsyncIterator = <Content extends object>(
  responses: Content[],
  doneCallback?: () => void,
) => {
  let didAbort = false;
  const itr = (async function* mockGenerate() {
    for (const response of responses) {
      yield response;
      if (didAbort) {
        break;
      }
    }
    doneCallback?.();
  })();
  return {
    itr,
    doneCallback,
    abort: () => (didAbort = true),
    [Symbol.asyncIterator]: () => itr,
  } as unknown as AbortableAsyncIterator<Content>;
};

const encoder = new TextEncoder();
export const mockReadableStream = (chunks: object[]) =>
  // ReadableStream is experimental in Node 20, but this case works.
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  new ReadableStream<object>({
    start(controller) {
      for (const chunk of chunks.slice(0, -1)) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              ...chunk,
              done: false,
            }),
          ),
        );
      }
      controller.enqueue(
        encoder.encode(
          JSON.stringify({
            ...chunks[chunks.length - 1],
            done: true,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            done_reason: 'stop',
          }),
        ),
      );
      controller.close();
    },
  });
