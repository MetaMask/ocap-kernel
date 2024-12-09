/**
 * Delay execution by the specified number of milliseconds.
 * Re-implemented here to avoid importing `@ocap/utils`, which assumes SES.
 *
 * @param ms - The number of milliseconds to delay.
 * @returns A promise that resolves after the specified delay.
 */
export const delay = async (ms = 1): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
