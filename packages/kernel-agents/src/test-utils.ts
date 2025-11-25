/**
 * Make a test stream.
 *
 * @param statements - The statements to yield.
 * @param transform - A function to transform the statements.
 * @returns A stream of statements.
 * @example
 * const stream = makeTestStream(['console.log("hello");', 'console.log("world");']);
 * for await (const statement of stream) {
 *   console.log(statement);
 * }
 */
export const makeTestStream = <Yield>(
  statements: string[],
  transform = (statement: string): Yield => statement as Yield,
): { stream: AsyncIterable<Yield>; abort: () => Promise<void> } => {
  let shouldAbort = false;
  return {
    abort: async () => {
      shouldAbort = true;
    },
    stream: (async function* () {
      for (const statement of statements) {
        if (shouldAbort) {
          break;
        }
        yield transform(statement);
      }
    })(),
  };
};
