/**
 * Example transcripts for the prompt
 */
import { extractCapabilitySchemas } from './capability.ts';
import { end as endCapability } from './default-capabilities.ts';
import { exampleCapabilities } from './example-capabilities.ts';
import {
  CapabilitySpecMessage,
  UserMessage,
  AssistantMessage,
  CapabilityResultMessage,
} from './messages.ts';
import type { Transcript } from './messages.ts';

const { end, count, add, multiply } = extractCapabilitySchemas({
  ...exampleCapabilities,
  end: endCapability,
});

const simpleSemanticTask: Transcript = [
  new CapabilitySpecMessage({ end, add }),
  new UserMessage('What color is a banana?'),
  new AssistantMessage({
    think: [
      'Bananas can be either yellow or green, depending on the variety and ripeness.',
      'Typically, people think of yellow bananas when they think of bananas.',
      'I should give the typical response, but clarify that I am assuming the banana is ripe.',
    ],
    invoke: [{ name: 'end', args: { final: 'A banana is yellow when ripe.' } }],
  }),
];

const multiStepCalculation: Transcript = [
  new CapabilitySpecMessage({ end, count, multiply }),
  new UserMessage(
    'What is the size of a matrix with rows indexed by the letters of "piano" and columns by the letters of "guitar"?',
  ),
  new AssistantMessage({
    think: [
      'I need to find the size of a matrix with rows indexed by the letters of "piano" and columns by the letters of "guitar".',
      'The answer will be the product of the length of the word "piano" and the length of the word "guitar".',
      'To prove my answer, I will count the lengths of the words using the "count" capability, then multiply the results using the "multiply" capability.',
    ],
    invoke: [
      { name: 'count', args: { word: 'piano' } },
      { name: 'count', args: { word: 'guitar' } },
    ],
  }),
  new CapabilityResultMessage([
    { name: 'count', args: { word: 'piano' }, result: 5 },
    { name: 'count', args: { word: 'guitar' }, result: 6 },
  ]),
  new AssistantMessage({
    think: ['Now I can multiply the results to get the answer.'],
    invoke: [{ name: 'multiply', args: { factors: [5, 6] } }],
  }),
  new CapabilityResultMessage([
    { name: 'multiply', args: { factors: [5, 6] }, result: 30 },
  ]),
  new AssistantMessage({
    think: ['Now I can return the answer.'],
    invoke: [
      { name: 'end', args: { final: 'Such a matrix would have 30 elements.' } },
    ],
  }),
];

export const exampleTranscripts = [simpleSemanticTask, multiStepCalculation];
