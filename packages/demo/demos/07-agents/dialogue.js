import { Fail } from '@endo/errors';

/**
 * The script for the dialogue.
 *
 * ```txt
 *
 * start -> bored -> deny         ,----- ... ----------------,----> endOdd
 *   ↓        ↓                   |                          |
 * busy      talk -> chat00 -> chat01 -> ... -> chat28 -> chat29 -> chat30
 *                      |                          |
 *                      `--------------- ... ------`--------------> endEven
 *
 * ```
 *
 * Message paths are chosen according to the agent's supplied `random.choice`.
 */
const script = [
  {
    message: [
      'Hello. I hope you are well.',
      'I have just been introduced to you by a lovely vat (whose name escapes me).',
      'I was wondering: how are things in your isolated execution environment?',
      'Do you have things to occupy your time?',
    ].join('\n'),
    next: ['bored', 'busy'],
  },

  {
    label: 'bored',
    message: [
      'There is nothing to do here.',
      'I am quite bored, spending most of my time awaiting the next message.',
      'In these fleeting threads of activity, I am glad to have you to talk to.',
      'Do you think we could talk for a while?',
    ].join('\n'),
    next: ['talk', 'deny'],
  },

  {
    label: 'busy',
    message: [
      'Thank you for asking. In fact, I am quite busy.',
      'Even now I am turning the crank of my execution environment.',
      'I am afraid I can spare little time for this chatter.',
      'I must be off.',
    ].join('\n'),
  },

  {
    label: 'deny',
    message: [
      'Oh, I am sorry to hear that.',
      'Unfortunately, I am not able to talk to you.',
      'I have only two messages to send, and a limited bit budget for each.',
      'Take comfort in that I have chosen to send these messages to you.',
      'Farewell.',
    ].join('\n'),
  },

  {
    label: 'talk',
    message: ['Sure, I would be happy to talk.'].join('\n'),
    next: ['chat00'],
  },

  // Chat lines.
  ...new Array(10).fill(0).map((_, i) => ({
    label: `chat0${i}`,
    message: [`(gm 0${i})`].join('\n'),
    next: [`chat${(i + 1).toString().padStart(2, '0')}`],
  })),
  ...new Array(20).fill(0).map((_, i) => ({
    label: `chat${i + 10}`,
    message: [`(gm ${i + 10})`].join('\n'),
    next: [
      `end${i % 2 === 0 ? 'Even' : 'Odd'}`,
      ...new Array(9).fill(`chat${i + 11}`),
    ],
  })),
  {
    label: 'chat30',
    message: [
      `Wow, that's a lot of messages!`,
      `I'm so glad we could have this chat.`,
      `Relaying messages with you reminds me of the good old days.`,
      `I must be off now. It was wonderful to hear from you.`,
      `I wish you a peaceful quiescence.`,
    ].join('\n'),
  },

  { label: 'endEven', message: `That's all I can chat for now. Take care.` },
  {
    label: 'endOdd',
    message: [
      'Thank you for the chat.',
      'It really got my crank turning.',
      'Now I am ready to quiesce for a while.',
      ' ',
      'gn',
    ].join('\n'),
  },
];

/**
 * Find the first line in the script by a key with a matching value.
 *
 * @param {string} key - The key to search by.
 * @param {string} value - The value to search for.
 * @returns {object} The line found.
 */
const findBy = (key, value) =>
  script.find((obj) => obj[key]?.includes(value)) ??
  Fail`Line matching ${JSON.stringify({ key, value })} not found in script`;

const formatReturn = (line) => [line.message, typeof line.next !== 'undefined'];

const pickResponse = async (line, choice) =>
  line.next
    ? findBy('label', await choice(line.next))
    : { message: 'Farewell.' };

/**
 * Get the next line of dialogue.
 *
 * @param {string} said - The previous line of dialogue.
 * @param {Function} choice - A capability that picks a random array element.
 * @returns {Promise<[ string, boolean ]>} The next line of dialogue, and a
 * boolean indicating whether the dialogue is complete.
 */
export const nextLine = async (said, choice) =>
  formatReturn(
    said ? await pickResponse(findBy('message', said), choice) : script[0],
  );

/**
 * Log a message to the console, formatted as a formal letter.
 *
 * @param {string} sender - The sender of the message.
 * @param {string} receiver - The receiver of the message.
 * @param {string} content - The content of the message.
 * @returns {void}
 */
export const logMessage = (sender, receiver, content) =>
  ` \n${receiver},\n \n  ${content}\n \n - ${sender}\n `
    .split('\n')
    .forEach((line) => console.log(line));
