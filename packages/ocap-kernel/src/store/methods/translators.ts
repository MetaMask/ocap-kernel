import type {
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';

import { coerceMessage, isRemoteId } from '../../types.ts';
import type {
  Message,
  VatId,
  EndpointId,
  KRef,
  VRef,
  RRef,
  ERef,
} from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getCListMethods } from './clist.ts';
import { getVatMethods } from './vat.ts';
import { Fail, assert } from '../../utils/assert.ts';

/**
 * Create a translator object that provides functionality for translating
 * references and messages between kernel and endpoint spaces.
 *
 * @param ctx - The store context.
 * @returns A translator object that maps various kernel data structures
 * onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getTranslators(ctx: StoreContext) {
  const { krefToEref, erefToKref, allocateErefForKref } = getCListMethods(ctx);
  const { exportFromEndpoint } = getVatMethods(ctx);

  /**
   * Reverse the direction indicator in an RRef.
   *
   * @param rref - The ref in question.
   *
   * @returns a copy of `rref` with '+'/'-' changed to '-'/'+'.
   */
  function invertRRef(rref: RRef): RRef {
    // eslint-disable-next-line require-unicode-regexp
    const parts = rref.match(/^(r[op])([-+])(\d+)$/);
    assert(parts?.length === 4);
    return `${parts[1]}${parts[2] === '+' ? '-' : '+'}${parts[3]}`;
  }

  /**
   * Translate a reference from kernel space into endpoint space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param kref - The KRef of the entity of interest.
   * @param importIfNeeded - If true, allocate a new clist entry if necessary;
   *   if false, require that such an entry already exist.
   *
   * @returns the ERef corresponding to `kref` in `endpointId`.
   */
  function translateRefKtoE(
    endpointId: EndpointId,
    kref: KRef,
    importIfNeeded: boolean,
  ): ERef {
    let eref = krefToEref(endpointId, kref);
    if (!eref) {
      if (importIfNeeded) {
        eref = allocateErefForKref(endpointId, kref);
      } else {
        throw Fail`unmapped kref ${kref} endpoint=${endpointId}`;
      }
    }
    if (isRemoteId(endpointId)) {
      // The import/export relationship between a vat and the kernel is
      // asymmetric -- the vat always exports to the kernel and imports from the
      // kernel. This is reflected in the string encoding of a VRef, where a '+'
      // indicates an export (vat to kernel) and a '-' indicates an import
      // (kernel to vat).  However, the relationship between two remotes is
      // symmetric -- an export from one is an import to the other and vice
      // versa. We thus require a convention for interpreting an RRef's
      // directionality encoding to break the symmetry. The trick (courtesy of
      // Brian Warner) is to always interpet an RRef in the context of the
      // receiving endpoint.  This means that when communicating an RRef (which
      // is implied by the fact that we're using a KtoE translation) we need to
      // flip the polarity of the character that encodes the import/export
      // direction to convert it from the sender's frame of reference to the
      // receiver's.
      //
      // Care must be taken when using these reference translation functions for
      // something other than communications (debugging or logging, say), since
      // whereas for a VRef the functional composition KtoE(EtoK(ref)) is an
      // identity function, for an RRef it is not, because KtoE reverses the
      // polarity of the RRef but EtoK doesn't.
      eref = invertRRef(eref);
    }
    return eref;
  }

  /**
   * Translate a capdata object from kernel space into endpoint space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to `endpointId`.
   */
  function translateCapDataKtoE(
    endpointId: EndpointId,
    capdata: CapData<KRef>,
  ): CapData<ERef> {
    const slots: ERef[] = [];
    for (const slot of capdata.slots) {
      slots.push(translateRefKtoE(endpointId, slot, true));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from kernel space into endpoint space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to `endpointId`.
   */
  function translateMessageKtoE(
    endpointId: EndpointId,
    message: Message,
  ): Message {
    const methargs = translateCapDataKtoE(
      endpointId,
      message.methargs as CapData<KRef>,
    );
    const result = message.result
      ? translateRefKtoE(endpointId, message.result, true)
      : message.result;
    const endpointMessage = coerceMessage({ ...message, methargs, result });
    return endpointMessage;
  }

  /**
   * Translate a reference from endpoint space into kernel space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param eref - The ERef of the entity of interest.
   *
   * @returns the KRef corresponding to `eref` in this endpoint.
   */
  function translateRefEtoK(endpointId: EndpointId, eref: ERef): KRef {
    let kref = erefToKref(endpointId, eref);
    kref ??= exportFromEndpoint(endpointId, eref);
    return kref;
  }

  /**
   * Translate a capdata object from endpoint space into kernel space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to the kernel.
   */
  function translateCapDataEtoK(
    endpointId: EndpointId,
    capdata: CapData<ERef>,
  ): CapData<KRef> {
    const slots: KRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(translateRefEtoK(endpointId, slot));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from endpoint space into kernel space.
   *
   * @param endpointId - The endpoint for whom translation is desired.
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to the kernel.
   */
  function translateMessageEtoK(
    endpointId: EndpointId,
    message: Message,
  ): Message {
    const methargs = translateCapDataEtoK(
      endpointId,
      message.methargs as CapData<ERef>,
    );
    if (typeof message.result !== 'string') {
      throw TypeError(`message result must be a string`);
    }
    const result = translateRefEtoK(endpointId, message.result);
    return { methargs, result };
  }

  /**
   * Translate a syscall from vat space into kernel space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param vso - The syscall object to be translated.
   *
   * @returns a translated copy of `vso` intelligible to the kernel.
   */
  function translateSyscallVtoK(
    vatId: VatId,
    vso: VatSyscallObject,
  ): VatSyscallObject {
    let kso: VatSyscallObject;
    switch (vso[0]) {
      case 'send': {
        // [VRef, Message];
        const [op, target, message] = vso;
        kso = [
          op,
          translateRefEtoK(vatId, target),
          // @ts-expect-error: Agoric's Message type has the property `result: string | undefined | null`.
          // Ours is `result?: string | null`. We can safely ignore the `undefined` case.
          translateMessageEtoK(vatId, coerceMessage(message)),
        ];
        break;
      }
      case 'subscribe': {
        // [VRef];
        const [op, promise] = vso;
        kso = [op, translateRefEtoK(vatId, promise)];
        break;
      }
      case 'resolve': {
        // [VatOneResolution[]];
        const [op, resolutions] = vso;
        const kResolutions: VatOneResolution[] = resolutions.map(
          (resolution) => {
            const [vpid, rejected, data] = resolution;
            return [
              translateRefEtoK(vatId, vpid),
              rejected,
              translateCapDataEtoK(vatId, data as CapData<VRef>),
            ];
          },
        );
        kso = [op, kResolutions];
        break;
      }
      case 'exit': {
        // [boolean, SwingSetCapData];
        const [op, isFailure, info] = vso;
        kso = [
          op,
          isFailure,
          translateCapDataEtoK(vatId, info as CapData<VRef>),
        ];
        break;
      }
      case 'dropImports':
      case 'retireImports':
      case 'retireExports':
      case 'abandonExports': {
        // [VRef[]];
        const [op, vrefs] = vso;
        const krefs = vrefs.map((ref) => translateRefEtoK(vatId, ref));
        kso = [op, krefs];
        break;
      }
      case 'callNow':
      case 'vatstoreGet':
      case 'vatstoreGetNextKey':
      case 'vatstoreSet':
      case 'vatstoreDelete': {
        const [op] = vso;
        throw Error(`vat ${vatId} issued invalid syscall ${op}`);
      }
      default: {
        // Compile-time exhaustiveness check
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw Error(`vat ${vatId} issued unknown syscall ${vso[0]}`);
      }
    }
    return kso;
  }

  return {
    translateRefEtoK,
    translateRefKtoE,
    translateCapDataKtoE,
    translateCapDataEtoK,
    translateMessageKtoE,
    translateMessageEtoK,
    translateSyscallVtoK,
    invertRRef,
  };
}
