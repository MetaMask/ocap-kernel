/**
 * Make an endowment for the Performance API.
 *
 * @returns An endowment that provides the Performance API.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function makePerformanceEndowment() {
  return {
    performance: harden({ now: () => 0 }),
  };
}
