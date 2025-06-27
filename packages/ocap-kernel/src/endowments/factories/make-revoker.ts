import type { VRef } from '../../types.ts';
import type { EndowmentContext } from '../types.ts';

/**
 * A function that revokes a distributed object, making it impossible to call
 * any methods on it.
 */
export type Revoker = () => void;

/**
 * A function that makes a revoker for a given object.
 */
export type MakeRevoker = (object: unknown) => Revoker;

/**
 * Make a function that makes a revoker for a given object. Intended to be used
 * as a user code endowment.
 *
 * @param context - The context in which the endowment is created.
 * @returns A function that makes a revoker for a given object.
 */
export function factory(context: EndowmentContext): MakeRevoker {
  const { syscall, toRef } = context;
  const revoke = (vref: VRef): void => {
    syscall.revoke([vref]);
  };
  /**
   * Make a revoker for a given object. A vat can only revoke its own objects,
   * so revokable delegation is not possible. After the revoker is called, all
   * eventual method calls from importers of the distributed object will fail.
   *
   * @param object - The object to revoke.
   * @returns A function that revokes the object.
   */
  function makeRevoker(object: unknown): Revoker {
    const ref = toRef(object);
    return harden(() => revoke(ref));
  }
  return harden(makeRevoker);
}
