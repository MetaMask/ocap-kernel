import { assert, Fail } from '../../utils/assert.ts';

/**
 * Parse a string into an object with `isReachable` and `vatSlot` properties.
 *
 * @param value - The string to parse.
 * @returns An object with `isReachable` and `vatSlot` properties.
 */
export function parseReachableAndVatSlot(value: string): {
  isReachable: boolean;
  vatSlot: string;
} {
  typeof value === 'string' || Fail`non-string value: ${value}`;
  const flag = value.slice(0, 1);
  assert.equal(value.slice(1, 2), ' ');
  const vatSlot = value.slice(2);
  let isReachable;
  if (flag === 'R') {
    isReachable = true;
  } else if (flag === '_') {
    isReachable = false;
  } else {
    throw Fail`flag (${flag}) must be 'R' or '_'`;
  }
  return { isReachable, vatSlot };
}
harden(parseReachableAndVatSlot);

/**
 * Build a string from an object with `isReachable` and `vatSlot` properties.
 *
 * @param isReachable - The `isReachable` property of the object.
 * @param vatSlot - The `vatSlot` property of the object.
 * @returns A string with the `isReachable` and `vatSlot` properties.
 */
export function buildReachableAndVatSlot(
  isReachable: boolean,
  vatSlot: string,
): string {
  return `${isReachable ? 'R' : '_'} ${vatSlot}`;
}
harden(buildReachableAndVatSlot);
