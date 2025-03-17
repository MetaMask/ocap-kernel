import { E } from '@endo/eventual-send';
import type { Logger } from '@ocap/utils';

export const makeInitUser = (
  // Importing the necessary type declaration is more trouble than it is worth.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vats: Record<string, any>,
  logger: Logger,
) => {
  console.debug('makeInitUser', JSON.stringify({ vats, logger }));
  return async (user: string, peers: string[]) => {
    logger.debug('initUser:user', user);
    const languageModel = vats[`${user}.llm`];
    const vectorStore = vats[`${user}.vectorStore`];
    await Promise.all([E(languageModel).init(), E(vectorStore).init()]);
    const defaultDocumentView = await E(vectorStore).makeDocumentView();
    const response = await E(vats[user]).init(
      languageModel,
      defaultDocumentView,
    );
    for (const peer of peers) {
      const trust = await E(vats[user]).getTrust(peer);
      await E(vats[user]).setPeerDocumentView(
        peer,
        await E(vectorStore).makeDocumentView(trust),
      );
    }
    logger.debug('initUser:response', response);
    return response;
  };
};
