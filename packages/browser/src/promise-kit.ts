import { makePromiseKit } from "@endo/promise-kit";

export const delayedDecision = async (value: boolean): Promise<void> => {
  const kit = makePromiseKit<void>();
  const timeout = setTimeout(() => {
    value
      ? kit.resolve()
      : kit.reject(new Error('rejected'));
    clearTimeout(timeout);
  }, 100);
}

export { makePromiseKit };
