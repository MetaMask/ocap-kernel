import { makePromiseKit } from '@endo/promise-kit';
import { waitUntilQuiescent } from '@metamask/kernel-utils';

import type { EndowmentContext } from '../types.ts';

/**
 * An ocap url.
 */
export type OcapUrl = `ocap://${string}`;

/**
 * A function that makes an ocap url for a given object.
 */
export type MakeOcapUrl = (object: unknown) => Promise<OcapUrl>;

/**
 * Make a function that makes an ocap url for a given object. Intended to be
 * used as a user code endowment.
 *
 * @param context - The context in which the endowment is created.
 * @returns A function that makes an ocap url for a given object.
 */
export function factory(context: EndowmentContext): MakeOcapUrl {
  const { toRef } = context;

  /**
   * Make an ocap url for a given object.
   *
   * @param object - The object to make an ocap url for.
   * @returns A promise that resolves with the ocap url.
   */
  const makeOcapUrl = async (object: unknown): Promise<OcapUrl> => {
    const { promise, resolve } = makePromiseKit<OcapUrl>();
    // This vpid can be sent to the kernel as the resolution target.
    const vpid = toRef(promise);
    const vref = toRef(object);
    console.log('makeOcapUrl', vpid, vref);
    // XXX this is a placeholder for the actual implementation which sends the
    // kernel a request to resolve the promise with an ocap url for the given
    // vref.
    waitUntilQuiescent()
      .catch((error) => console.error('wait until quiescent failed:', error))
      .then(() => resolve(`ocap://${vref}`))
      .catch((error) => console.error('resolve failed:', error));
    return promise;
  };

  return harden(makeOcapUrl);
}
