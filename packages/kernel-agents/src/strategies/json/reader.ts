import type { Logger } from '@metamask/logger';

import { AssistantMessage } from './messages.ts';
import type { AssistantMessageJson } from './messages.ts';
import { makeSampleCollector } from './sample-collector.ts';
import { gatherStreamingResponse, ifDefined, withAbort } from '../../utils.ts';

export const makeReader =
  ({ logger }: { logger?: Logger }) =>
  async ({
    stream,
    abort,
    prefix,
  }: {
    stream: AsyncIterable<{ response: string }>;
    abort: () => Promise<void>;
    prefix: string;
  }) => {
    const sampleLogger = logger?.subLogger({ tags: ['sample'] });
    const gatherLogger = logger?.subLogger({ tags: ['gather'] });
    return await withAbort(abort, async (): Promise<AssistantMessage> => {
      const json = await gatherStreamingResponse<AssistantMessageJson>({
        stream,
        parse: makeSampleCollector({
          prefix,
          ...ifDefined({ logger: sampleLogger }),
        }),
        ...ifDefined({ logger: gatherLogger }),
      });
      logger?.info('assistant message:', json);
      return new AssistantMessage(json);
    });
  };
