import { makeMarshaller } from '@agoric/swingset-liveslots';
import { Fail } from '@endo/errors';

// Used in the docs for a safe use of `toRef`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { factory as makeRevoker } from './factories/make-revoker.ts';
import type { EndowmentContext, ToRef, Marshaller } from './types.ts';
import type { GCTools, Syscall } from '../services/types.ts';
import type { VatId } from '../types.ts';

/**
 * Make a function that converts an object to a vref.
 *
 * **ATTN**: Do not expose the return value of this function to user code.
 *
 * This is a hack that disrespects liveslots's encapsulation of the marshaller.
 * If the user code gets a handle on `toRef` and a capability to send messages
 * to the kernel, it can break vat containment by impersonating its supervisor.
 *
 * It is fine to expose a hardened function which passes an object to `toRef`,
 * as long as the vref cannot escape the scope of that function.
 *
 * @see {@link makeRevoker} for an example of safe use of `toRef`.
 *
 * @param marshaller - The liveslots marshaller.
 * @returns A function that converts an object to a vref.
 */
function makeToRef(marshaller: Marshaller): ToRef {
  const toRef: ToRef = (object) =>
    marshaller.toCapData(object).slots[0] ??
    Fail`cannot make ocap url for object ${object}`;
  return harden(toRef);
}

/**
 * Make a context for an endowment.
 *
 * @param syscall - The syscall object.
 * @param gcTools - The gc tools.
 * @param vatId - The vat id.
 * @returns A context for an endowment.
 */
export function makeEndowmentContext(
  syscall: Syscall,
  gcTools: GCTools,
  vatId: VatId,
): EndowmentContext {
  const toRef = makeToRef(makeMarshaller(syscall, gcTools, vatId).m);
  return { syscall, gcTools, vatId, toRef };
}
