import type { makeMarshaller } from '@agoric/swingset-liveslots';

import type { GCTools, Syscall } from '../services/types.ts';
import type { VRef, VatId } from '../types.ts';

export type Marshaller = ReturnType<typeof makeMarshaller>['m'];

/**
 * A function that converts an object to a vref.
 */
export type ToRef = (object: unknown) => VRef;

/**
 * The context in which an endowment is created.
 */
export type EndowmentContext = {
  syscall: Syscall;
  gcTools: GCTools;
  vatId: VatId;
  toRef: ToRef;
};

export type EndowmentDefinition = {
  factory: (context: EndowmentContext) => unknown;
};
