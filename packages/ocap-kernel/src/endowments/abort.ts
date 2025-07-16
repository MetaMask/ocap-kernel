/**
 * Make an endowment for the AbortController API.
 *
 * @returns An endowment that provides the AbortController API.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function makeAbortEndowment() {
  return {
    AbortController: harden(globalThis.AbortController ?? class {}),
  };
}
