import { extractCapabilitySchemas } from '../capability.ts';
import { exampleTranscripts } from './example-transcripts.ts';
import { CapabilitySpecMessage, UserMessage } from './messages.ts';
import type { Transcript } from './messages.ts';
import type { CapabilityRecord, Chat } from '../types.ts';

const stringifyTranscript = (transcript: Transcript, index: number): string =>
  [
    `TRANSCRIPT ${index + 1}: [`,
    transcript.map((message) => message.toJSON()).join(', '),
    `]`,
  ].join(' ');

export const makeChat = (
  capabilities: CapabilityRecord,
  query: string,
  transcript: Transcript = [],
): Chat => {
  transcript.push(
    new CapabilitySpecMessage(extractCapabilitySchemas(capabilities)),
    new UserMessage(query),
  );
  const transcripts = [...exampleTranscripts, transcript];
  const preamble = [
    `The following are ${transcripts.length} transcripts of conversations between a user and a state-of-the-art capability-augmented assistant.`,
    `Each transcript begins with a JSON-formatted list of the assistant's available capabilities, then proceeds to the conversation history, including user messages, assistant capability invocations, and the results of those invocations.`,
    `Note that the assistant efficiently invokes capabilities to perform tasks. This reflects that the assistant is intelligent and can reason logically about function composition, and prefers to invoke external capabilities to prove the correctness of its answers.`,
    `Also note that, although the assistant does not necessarily use every available capability, it never attempts to use a capability that was not specified prior in the transcript.`,
  ].join('\n');
  /**
   * The assistant must either immediately invoke a capability, or think and then
   * invoke a capability. In either case, the next piece of the transcript must
   * begin with this incomplete JSON prefix.
   *
   * XXX Subtle changes in the prefix can disrupt the tokenized pattern;
   * this prompt string is aligned to llama3's implicit tokenizer boundaries.
   */
  const responsePrefix = `{"messageType":"assistant","`;
  return {
    getPromptAndPrefix: () => {
      const rawPrompt = [
        preamble,
        ...transcripts.map(stringifyTranscript),
      ].join('\n\n');
      const prompt = `${rawPrompt.slice(0, rawPrompt.length - 1)}, ${responsePrefix}`;
      return { prompt, prefix: responsePrefix };
    },
    pushMessages: (...messages: Transcript) => {
      transcript.push(...messages);
    },
  };
};
