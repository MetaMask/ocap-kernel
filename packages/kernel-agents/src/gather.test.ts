import { describe, it, expect } from 'vitest';

import { gatherStreamingResponse } from './gather.ts';
import { makeIncrementalParser } from './json/parser.ts';

describe('gatherStreamingResponse', () => {
  it('gathers complete response from single chunk', async () => {
    const stream = (async function* () {
      yield { response: '{"key": "value"}' };
    })();
    const parser = makeIncrementalParser({});
    const result = await gatherStreamingResponse({ stream, parse: parser });
    expect(result).toStrictEqual({ key: 'value' });
  });

  it('gathers response from multiple chunks', async () => {
    const stream = (async function* () {
      yield { response: '{"key": "val' };
      yield { response: 'ue", "content": 42}' };
    })();
    const parser = makeIncrementalParser({});
    const result = await gatherStreamingResponse({ stream, parse: parser });
    expect(result).toStrictEqual({ key: 'value', content: 42 });
  });

  it('throws error when stream ends without parse event', async () => {
    const stream = (async function* () {
      yield { response: 'incomplete json' };
    })();
    const parser = makeIncrementalParser({});
    await expect(
      gatherStreamingResponse({ stream, parse: parser }),
    ).rejects.toThrow('stream ended without a parse event');
  });
});
