import { mergeDisjointRecords } from '@metamask/kernel-utils';
import type { Logger } from '@metamask/logger';
import type {
  ChatMessage,
  ChatResult,
} from '@ocap/kernel-language-model-service';

import {
  extractCapabilitySchemas,
  extractCapabilities,
} from '../capabilities/capability.ts';
import { makeEnd } from '../capabilities/end.ts';
import type { Agent } from '../types/agent.ts';
import { Message } from '../types/messages.ts';
import type { CapabilityRecord, Experience } from '../types.ts';

/**
 * Adapts a raw {@link ChatMessage} into the typed {@link Message} hierarchy
 * so that chat turns can be recorded in {@link Experience.history}.
 */
class ChatTurn extends Message<string> {
  /**
   * @param chatMessage - The raw chat message to wrap.
   * @param chatMessage.role - The sender role of the message.
   * @param chatMessage.content - The text content of the message.
   */
  constructor({ role, content }: ChatMessage) {
    super(role, { content });
  }
}

/**
 * A bound chat function with the model already configured.
 * Construct one from a {@link ChatService} using `makeChatClient`:
 *
 * ```ts
 * const client = makeChatClient(serviceRef, model);
 * const chat = (messages) => client.chat.completions.create({ messages });
 * ```
 */
export type BoundChat = (messages: ChatMessage[]) => Promise<ChatResult>;

export type MakeChatAgentArgs = {
  /**
   * Bound chat function — model is pre-configured by the caller.
   *
   * @see {@link BoundChat}
   */
  chat: BoundChat;
  /**
   * Capabilities the agent may invoke, expressed as a {@link CapabilityRecord}.
   * An `end` capability is automatically added to signal task completion.
   */
  capabilities: CapabilityRecord;
};

/**
 * Build the system prompt that instructs the model to invoke capabilities
 * by responding with JSON objects.
 *
 * @param capSchemas - Serialized capability schemas.
 * @returns The system prompt string.
 */
function buildSystemPrompt(capSchemas: Record<string, unknown>): string {
  return [
    'You are a capability-augmented assistant.',
    'To invoke a capability, respond with ONLY a JSON object:',
    '  {"name": "<capability_name>", "args": {<arguments>}}',
    'Do not include any other text when invoking a capability.',
    '',
    'Available capabilities:',
    JSON.stringify(capSchemas, null, 2),
    '',
    'When you have a final answer, invoke the "end" capability:',
    '  {"name": "end", "args": {"final": "<your response>"}}',
  ].join('\n');
}

/**
 * Extract the first JSON object from the model's response and validate that
 * it looks like a capability invocation (`{name, args}`).
 *
 * @param content - Raw assistant message content.
 * @returns Parsed invocation, or `null` if none found.
 */
function parseInvocation(
  content: string,
): { name: string; args: Record<string, unknown> } | null {
  const match = /\{[\s\S]*\}/u.exec(content);
  if (!match) {
    return null;
  }
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'name' in parsed &&
      typeof (parsed as Record<string, unknown>).name === 'string'
    ) {
      const { name, args } = parsed as {
        name: string;
        args?: Record<string, unknown>;
      };
      return { name, args: args ?? {} };
    }
  } catch {
    // not a valid capability invocation
  }
  return null;
}

/**
 * Make a chat-based capability-augmented agent.
 *
 * Unlike {@link makeJsonAgent} which uses raw text completion, this agent
 * drives the loop via a chat messages array, making it compatible with any
 * OpenAI-compatible or Ollama chat endpoint.
 *
 * Capabilities are described to the model via a JSON system prompt.
 * The model signals completion by invoking the auto-injected `end` capability.
 *
 * @param args - Construction arguments.
 * @param args.chat - Bound chat function (model already configured).
 * @param args.capabilities - Capabilities the agent may invoke.
 * @returns A kernel agent implementing the {@link Agent} interface.
 */
export const makeChatAgent = ({
  chat,
  capabilities: agentCapabilities,
}: MakeChatAgentArgs): Agent => {
  const experienceLog: Experience[] = [];

  return {
    task: async <Result>(
      intent: string,
      judgment?: (result: unknown) => result is Result,
      {
        invocationBudget = 10,
        logger,
      }: { invocationBudget?: number; logger?: Logger } = {},
    ): Promise<Result> => {
      const [end, didEnd, getEnd] = makeEnd<Result>();
      const capabilities = mergeDisjointRecords(agentCapabilities, {
        end,
      }) as CapabilityRecord;

      const effectiveJudgment =
        judgment ?? ((result: unknown): result is Result => true);
      const objective = { intent, judgment: effectiveJudgment };
      const context = { capabilities };

      const capSchemas = extractCapabilitySchemas(capabilities);
      const capFunctions = extractCapabilities(capabilities);

      const chatHistory: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(capSchemas) },
        { role: 'user', content: intent },
      ];

      const history = chatHistory.map((chatMsg) => new ChatTurn(chatMsg));
      const experience: Experience = { objective, context, history };
      experienceLog.push(experience);

      try {
        for (let step = 0; step < invocationBudget; step++) {
          logger?.info(`Step ${step + 1} of ${invocationBudget}`);

          const chatResult = await chat(chatHistory);
          const assistantMessage = chatResult.choices[0]?.message;
          if (!assistantMessage) {
            throw new Error('No response from model');
          }

          chatHistory.push(assistantMessage);
          history.push(new ChatTurn(assistantMessage));

          const invocation = parseInvocation(assistantMessage.content);
          if (!invocation) {
            // Plain text — treat as final answer without capability invocation
            const result = assistantMessage.content as unknown as Result;
            Object.assign(experience, { result });
            return result;
          }

          const { name, args } = invocation;
          logger?.info(`Invoking capability: ${name}`, args);

          const cap = capFunctions[name];
          if (!cap) {
            const errorContent = `[Error]: Unknown capability "${name}"`;
            chatHistory.push({ role: 'user', content: errorContent });
            history.push(new ChatTurn({ role: 'user', content: errorContent }));
            continue;
          }

          let toolResult: unknown;
          try {
            toolResult = await cap(args as never);
          } catch (error) {
            const errorContent = `[Error calling ${name}]: ${(error as Error).message}`;
            chatHistory.push({ role: 'user', content: errorContent });
            history.push(new ChatTurn({ role: 'user', content: errorContent }));
            continue;
          }

          const resultContent = `[Result of ${name}]: ${JSON.stringify(toolResult)}`;
          chatHistory.push({ role: 'user', content: resultContent });
          history.push(new ChatTurn({ role: 'user', content: resultContent }));

          if (didEnd()) {
            const result = getEnd();
            if (!effectiveJudgment(result)) {
              throw new Error(`Invalid result: ${JSON.stringify(result)}`);
            }
            Object.assign(experience, { result });
            return result;
          }
        }
        throw new Error('Invocation budget exceeded');
      } catch (error) {
        if (error instanceof Error) {
          Object.assign(experience, { error });
        }
        throw error;
      }
    },

    get experiences() {
      return (async function* () {
        yield* experienceLog;
      })();
    },
  };
};
