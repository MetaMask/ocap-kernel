import { makeCounter, mergeDisjointRecords } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type { LanguageModel } from '@ocap/kernel-language-model-service';

import { invokeCapabilities } from './capability.ts';
import { end } from './default-capabilities.ts';
import { AssistantMessage, CapabilityResultMessage } from './messages.ts';
import type { AssistantMessageJson } from './messages.ts';
import { gatherStreamingResponse, makeIncrementalParser } from './parser.ts';
import { makeChat } from './prompt.ts';
import type { Agent, CapabilityRecord } from './types.ts';

/**
 * Make a capability-augmented agent
 *
 * @param args - The arguments to make the agent.
 * @param args.llm - The language model to use for the agent
 * @param args.capabilities - The agent's capabilities
 * @param args.logger - The logger to use for the agent
 * @returns A kernel agent
 */
export const makeAgent = ({
  llm,
  capabilities,
  logger,
}: {
  llm: LanguageModel<unknown, { response: string }>;
  capabilities: CapabilityRecord;
  logger?: Logger;
}): Agent => {
  const agentCapabilities = mergeDisjointRecords(
    { end },
    capabilities,
  ) as CapabilityRecord;

  const taskCounter = makeCounter();

  return {
    task: async (
      query: string,
      { invocationBudget = 10 }: { invocationBudget?: number } = {},
    ) => {
      // XXX Tasks could be integrated deeper in the kernel
      const taskId = `t${taskCounter().toString().padStart(3, '0')}`;
      const taskLogger = logger?.subLogger({ tags: [taskId] });
      taskLogger?.info('query:', query);

      const { getPromptAndPrefix, pushMessages } = makeChat(
        agentCapabilities,
        query,
      );

      for (let invocation = 0; invocation < invocationBudget; invocation++) {
        taskLogger?.info(`begin invocation ${invocation}/${invocationBudget}`);

        const { prompt, prefix } = getPromptAndPrefix();
        const parse = makeIncrementalParser<AssistantMessageJson>({
          prefix,
          ...(taskLogger ? { logger: taskLogger } : {}),
        });
        taskLogger?.info('prompt:', prompt);

        const { stream, abort } = await llm.sample(prompt);
        let assistantMessage: AssistantMessageJson;
        try {
          assistantMessage = await gatherStreamingResponse({
            stream,
            parse,
          });
        } finally {
          // Stop the LLM from generating anymore
          await abort();
        }
        taskLogger?.info('assistantMessage:', assistantMessage);

        // TODO: this should already be validated by the parser
        if (!assistantMessage.invoke) {
          throw new Error('No invoke in result');
        }
        const results = await invokeCapabilities(
          assistantMessage.invoke,
          agentCapabilities,
        );
        taskLogger?.info('results:', results);
        const didEnd = results.find((capability) => capability.name === 'end');
        if (didEnd) {
          taskLogger?.info('exit invocation with result:', didEnd.result);
          return didEnd.result;
        }
        pushMessages(
          new AssistantMessage(assistantMessage),
          new CapabilityResultMessage(results),
        );
      }
      throw new Error('Invocation budget exceeded');
    },
  };
};
