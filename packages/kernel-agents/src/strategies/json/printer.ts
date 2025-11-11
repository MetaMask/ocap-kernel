import type { Logger } from '@metamask/logger';

import type {
  AssistantMessage,
  CapabilityResultMessage,
  Transcript,
} from './messages.ts';

export const makePrinter = ({
  history,
  logger,
}: {
  history: Transcript;
  logger?: Logger;
}) => {
  for (const message of history) {
    logger?.info(message.toJSON());
  }
  return (
    message: AssistantMessage,
    result: CapabilityResultMessage | null,
  ) => {
    logger?.info(message.toJSON());
    if (result) {
      logger?.info(result.toJSON());
    }
  };
};
