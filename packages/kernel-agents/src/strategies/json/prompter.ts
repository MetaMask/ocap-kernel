import { exampleTranscripts } from './example-transcripts.ts';
import type { Transcript } from './messages.ts';

const makePreamble = (nTranscripts: number): string => {
  const firstLinePrefix =
    nTranscripts === 1
      ? 'The following is a transcript of a conversation'
      : `The following are ${nTranscripts} transcripts of conversations`;
  const secondLinePrefix = nTranscripts === 1 ? 'The' : 'Each';
  return [
    `${firstLinePrefix} between a user and a state-of-the-art capability-augmented assistant.`,
    `${secondLinePrefix} transcript begins with a JSON-formatted list of the assistant's available capabilities, then proceeds to the conversation history, including user messages, assistant capability invocations, and the results of those invocations.`,
    `Note that the assistant efficiently invokes capabilities to perform tasks. This reflects that the assistant is intelligent and can reason logically about function composition, and prefers to invoke external capabilities to prove the correctness of its answers.`,
    `Also note that, although the assistant does not necessarily use every available capability, it never attempts to use a capability that was not specified prior in the transcript.`,
  ].join('\n');
};

/**
 * The assistant must either immediately invoke a capability, or think and then
 * invoke a capability. In either case, the next piece of the transcript must
 * begin with this incomplete JSON prefix.
 *
 * XXX Subtle changes in the prefix can disrupt the tokenized pattern;
 * this prompt string is aligned to llama3's implicit tokenizer boundaries.
 */
const prefix = `{"messageType":"assistant","`;

export const makePrompter = () => (history: Transcript) => {
  const transcripts = [...exampleTranscripts, history];
  const preamble = makePreamble(transcripts.length);
  const rawPrompt = [
    preamble,
    ...transcripts.map((transcript, index) =>
      [
        `TRANSCRIPT ${index + 1}: [`,
        transcript.map((message) => message.toJSON()).join(', '),
        `]`,
      ].join(' '),
    ),
  ].join('\n\n');
  const prompt = `${rawPrompt.slice(0, rawPrompt.length - 1)}, ${prefix}`;
  return { prompt, readerArgs: { prefix } };
};
