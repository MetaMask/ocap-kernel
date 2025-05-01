import { assert, Fail } from '../../utils/assert.ts';

// Object/promise references (in the kernel) contain a two-tuple of (type,
// index). All object references point to entries in the kernel Object
// Table, which records the vat that owns the actual object. In that vat,
// the object reference will be expressed as 'o+NN', and the NN was
// allocated by that vat when they first exported the reference into the
// kernel. In all other vats, if/when they are given a reference to this
// object, they will receive 'o-NN', with the NN allocated by the kernel
// clist for the recipient vat.

type KernelSlotType = 'object' | 'promise';

/**
 * Parse a kernel slot reference string into a kernel slot object.
 *
 * @param slot  The string to be parsed, as described above.
 * @returns kernel slot object corresponding to the parameter.
 * @throws if the given string is syntactically incorrect.
 */
export function parseKernelSlot(slot: string): {
  type: KernelSlotType;
  id: string;
} {
  assert.typeof(slot, 'string');
  let type: KernelSlotType;
  let idSuffix: string;
  if (slot.startsWith('ko')) {
    type = 'object';
    idSuffix = slot.slice(2);
  } else if (slot.startsWith('kp')) {
    type = 'promise';
    idSuffix = slot.slice(2);
  } else {
    throw Fail`invalid kernelSlot ${slot}`;
  }
  const id = idSuffix;
  return { type, id };
}

/**
 * Generate a kernel slot reference string given a type and id.
 *
 * @param type - The kernel slot type desired, a string.
 * @param id - The id, a number.
 * @returns the corresponding kernel slot reference string.
 * @throws if type is not one of the above known types.
 */
export function makeKernelSlot(type: KernelSlotType, id: string): string {
  if (type === 'object') {
    return `ko${id}`;
  }
  if (type === 'promise') {
    return `kp${id}`;
  }
  throw Fail`unknown type ${type}`;
}

/**
 * Assert function to ensure that a kernel slot reference string refers to a
 * slot of a given type.
 *
 * @param type - The kernel slot type desired, a string.
 * @param kernelSlot - The kernel slot reference string being tested
 * @throws if kernelSlot is not of the given type or is malformed.
 */
export function insistKernelType(
  type: KernelSlotType,
  kernelSlot: string | undefined,
): asserts kernelSlot is KernelSlotType {
  if (kernelSlot === undefined) {
    throw Fail`kernelSlot is undefined`;
  }
  type === parseKernelSlot(kernelSlot).type ||
    Fail`kernelSlot ${kernelSlot} is not of type ${type}`;
}
