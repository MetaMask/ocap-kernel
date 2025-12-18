/**
 * Tokenizer function that converts a string into tokens.
 * Can return either a synchronous array or an async iterable.
 *
 * @param text - The text to tokenize
 * @returns Either an array of tokens or an async iterable of tokens
 */
export type Tokenizer = (text: string) => string[] | AsyncIterable<string>;

/**
 * Split text by whitespace.
 * For each word, attach at most one whitespace character from the whitespace
 * immediately preceding it. Any extra whitespace becomes separate tokens.
 *
 * @param text - The text to tokenize
 * @returns An array of tokens
 */
export const whitespaceTokenizer = (text: string): string[] => {
  const tokens: string[] = [];
  // Match words with optional preceding whitespace (captured in group 1)
  const regex = /(\s*)(\S+)/gu;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    const [, whitespace, word] = match;
    const matchIndex = match.index;
    if (!word) {
      continue;
    }
    const whitespaceStr = whitespace ?? '';
    const whitespaceLength = whitespaceStr.length;

    // Process whitespace before the word
    if (whitespaceLength > 0) {
      // Add all but one whitespace character as separate tokens (before the word)
      for (const char of whitespaceStr.slice(0, whitespaceLength - 1)) {
        tokens.push(char);
      }
      // Attach the last whitespace character to the word
      tokens.push(whitespaceStr[whitespaceLength - 1] + word);
    } else {
      tokens.push(word);
    }

    lastIndex = matchIndex + whitespaceLength + word.length;
  }

  // Add any trailing whitespace as separate tokens
  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex);
    for (const char of trailing) {
      tokens.push(char);
    }
  }

  return tokens;
};
