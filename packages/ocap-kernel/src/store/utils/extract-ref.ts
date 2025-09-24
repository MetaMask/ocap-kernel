import type { CapData } from '@endo/marshal';
import { passStyleOf } from '@endo/pass-style';

import { kunser, krefOf } from '../../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../../liveslots/kernel-marshal.ts';
import type { KRef } from '../../types.ts';

/**
 * Obtain the KRef from a simple value represented as a CapData object.
 *
 * @param data - The data object to be examined.
 * @returns the single KRef that is `data`, or null if it isn't one.
 */
export function extractSingleRef(data: CapData<KRef>): KRef | null {
  const value = kunser(data) as SlotValue;
  const style: string = passStyleOf(value);
  if (style === 'remotable' || style === 'promise') {
    return krefOf(value);
  }
  return null;
}
