import type { Logger } from '@metamask/logger';
import type {
  ChatMessage,
  ChatResult,
  Tool,
} from '@ocap/kernel-language-model-service';
import { parseToolArguments } from '@ocap/kernel-language-model-service/utils/parse-tool-arguments';

import { extractCapabilitySchemas } from '../capabilities/capability.ts';
import { validateCapabilityArgs } from '../capabilities/validate-capability-args.ts';
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
    super(role, { content: content ?? '' });
    harden(this);
  }
}

harden(ChatTurn);

/**
 * A bound chat function with the model already configured.
 * Construct one from a {@link ChatService} using `makeChatClient`:
 *
 * ```ts
 * const client = makeChatClient(serviceRef, model);
 * const chat = ({ messages, tools }) =>
 *   client.chat.completions.create({ messages, tools });
 * ```
 */
export type BoundChat = (params: {
  messages: ChatMessage[];
  tools?: Tool[];
}) => Promise<ChatResult>;

export type MakeChatAgentArgs = {
  /**
   * Bound chat function — model is pre-configured by the caller.
   *
   * @see {@link BoundChat}
   */
  chat: BoundChat;
  /**
   * Capabilities the agent may invoke, expressed as a {@link CapabilityRecord}.
   */
  capabilities: CapabilityRecord;
};

/**
 * Convert a {@link CapabilityRecord} to the {@link Tool} array expected by
 * the chat completions API.
 *
 * @param capabilities - The capabilities to convert.
 * @returns An array of tool definitions.
 */
function buildTools(capabilities: CapabilityRecord): Tool[] {
  const schemas = extractCapabilitySchemas(capabilities);
  return Object.entries(schemas).map(([name, schema]) => ({
    type: 'function' as const,
    function: {
      name,
      description: schema.description,
      parameters: {
        type: 'object' as const,
        properties: schema.args,
        required: Object.keys(schema.args),
      },
    },
  }));
}

/**
 * Make a chat-based capability-augmented agent.
 *
 * Unlike {@link makeJsonAgent} which uses raw text completion, this agent
 * drives the loop via a chat messages array and the standard tool-calling
 * interface, making it compatible with any OpenAI-compatible chat endpoint.
 *
 * Capabilities are exposed to the model as tools via the `tools` parameter.
 * The model signals completion by returning a message without tool calls.
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
      const effectiveJudgment =
        judgment ?? ((result: unknown): result is Result => true);
      const objective = { intent, judgment: effectiveJudgment };
      const context = { capabilities: agentCapabilities };

      const tools = buildTools(agentCapabilities);

      const chatHistory: ChatMessage[] = [{ role: 'user', content: intent }];

      const history = chatHistory.map((chatMsg) => new ChatTurn(chatMsg));
      const experience: Experience = { objective, context, history };
      experienceLog.push(experience);

      try {
        for (let step = 0; step < invocationBudget; step++) {
          logger?.info(`Step ${step + 1} of ${invocationBudget}`);

          const chatResult = await chat({
            messages: chatHistory,
            ...(tools.length > 0 && { tools }),
          });
          const assistantMessage = chatResult.choices[0]?.message;
          if (!assistantMessage) {
            throw new Error('No response from model');
          }

          chatHistory.push(assistantMessage);
          history.push(new ChatTurn(assistantMessage));

          const { tool_calls: toolCalls } = assistantMessage;
          if (!toolCalls?.length) {
            // No tool calls — model has a final answer
            const result = assistantMessage.content as unknown as Result;
            if (!effectiveJudgment(result)) {
              throw new Error(`Invalid result: ${JSON.stringify(result)}`);
            }
            Object.assign(experience, { result });
            return result;
          }

          for (const toolCall of toolCalls) {
            const { name, arguments: argsJson } = toolCall.function;
            logger?.info(`Invoking capability: ${name}`);

            const spec = Object.hasOwn(agentCapabilities, name)
              ? agentCapabilities[name]
              : undefined;
            if (spec === undefined) {
              const errorContent = `Unknown capability "${name}"`;
              const toolMsg: ChatMessage = {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorContent,
              };
              chatHistory.push(toolMsg);
              history.push(new ChatTurn(toolMsg));
              continue;
            }

            let toolResult: unknown;
            try {
              const args = parseToolArguments(argsJson);
              validateCapabilityArgs(args, spec.schema);
              toolResult = await spec.func(args as never);
            } catch (error) {
              const errorContent = `Error calling ${name}: ${(error as Error).message}`;
              const toolMsg: ChatMessage = {
                role: 'tool',
                tool_call_id: toolCall.id,
                content: errorContent,
              };
              chatHistory.push(toolMsg);
              history.push(new ChatTurn(toolMsg));
              continue;
            }

            const toolMsg: ChatMessage = {
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(toolResult),
            };
            chatHistory.push(toolMsg);
            history.push(new ChatTurn(toolMsg));
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
