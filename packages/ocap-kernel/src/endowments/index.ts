import type { GCTools, Syscall } from '../services/types.ts';
import type { VatId } from '../types.ts';
import { makeEndowmentContext } from './context.ts';
import type { EndowmentName, Endowments } from './factories/index.ts';
import endowmentDefinitions from './factories/index.ts';

const allEndowmentNames = Object.keys(endowmentDefinitions) as EndowmentName[];

/**
 * Make a set of endowments for a vat.
 *
 * @param syscall - The syscall object.
 * @param gcTools - The gc tools.
 * @param vatId - The vat id.
 * @param names - The names of the endowments to make. If not provided, all
 *   endowments are made. XXX The default should be to make *no* endowments.
 * @returns A set of endowments for a vat.
 */
export function makeEndowments(
  syscall: Syscall,
  gcTools: GCTools,
  vatId: VatId,
  names: EndowmentName[] = allEndowmentNames,
): Endowments {
  const context = makeEndowmentContext(syscall, gcTools, vatId);
  return Object.fromEntries(
    Object.entries(endowmentDefinitions)
      .filter(([name]) => names.includes(name as EndowmentName))
      .map(([name, definition]) => [name, definition.factory(context)]),
  ) as Endowments;
}
