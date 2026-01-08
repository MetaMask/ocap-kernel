import type { Logger } from '@metamask/logger';
import {
  ifDefined,
  withAbort,
  gatherStreamingResponse,
} from '@ocap/kernel-agents/utils';

import type { StatementMessage } from './messages.ts';
import { makeSampleCollector } from './sample-collector.ts';

export const makeReader =
  ({ logger }: { logger?: Logger }) =>
  async ({
    stream,
    abort,
    stop,
  }: {
    stream: AsyncIterable<{ response: string }>;
    abort: () => Promise<void>;
    stop: string;
  }) => {
    const sampleLogger = logger?.subLogger({ tags: ['sample'] });
    const gatherLogger = logger?.subLogger({ tags: ['gather'] });
    return await withAbort(
      abort,
      async (): Promise<StatementMessage> =>
        await gatherStreamingResponse({
          stream,
          parse: makeSampleCollector({
            stop,
            ...ifDefined({ logger: sampleLogger }),
          }),
          ...ifDefined({ logger: gatherLogger }),
        }),
    );
  };
