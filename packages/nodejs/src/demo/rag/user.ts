import { E } from '@endo/eventual-send';
import type { Logger } from '@ocap/utils';

export const makeInitUser = (
  // Importing the necessary type declaration is more trouble than it is worth.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vats: Record<string, any>,
  logger: Logger,
) => {
  console.debug('makeInitUser', JSON.stringify({ vats, logger }));
  return async (user: string) => {
    logger.debug('boot.initUser:user', user);
    const response = await E(vats[user]).init(
      vats[`${user}.llm`],
      vats[`${user}.vectorStore`],
    );
    logger.debug('boot.initUser:response', response);
  };
};
