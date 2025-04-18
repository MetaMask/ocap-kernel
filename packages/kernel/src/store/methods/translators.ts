import type {
  VatOneResolution,
  VatSyscallObject,
} from '@agoric/swingset-liveslots';
import type { CapData } from '@endo/marshal';

import { coerceMessage } from '../../types.ts';
import type { Message, VatId, KRef, VRef } from '../../types.ts';
import type { StoreContext } from '../types.ts';
import { getCListMethods } from './clist.ts';
import { getVatMethods } from './vat.ts';
import { Fail } from '../../utils/assert.ts';

/**
 * Create a translator object that provides functionality for translating
 * references and messages between kernel and vat spaces.
 *
 * @param ctx - The store context.
 * @returns A translator object that maps various kernel data structures
 * onto `kv`.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function getTranslators(ctx: StoreContext) {
  const { krefToEref, erefToKref, allocateErefForKref } = getCListMethods(ctx);
  const { exportFromVat } = getVatMethods(ctx);

  /**
   * Translate a reference from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param kref - The KRef of the entity of interest.
   * @param importIfNeeded - If true, allocate a new clist entry if necessary;
   *   if false, require that such an entry already exist.
   *
   * @returns the VRef corresponding to `kref` in `vatId`.
   */
  function translateRefKtoV(
    vatId: VatId,
    kref: KRef,
    importIfNeeded: boolean,
  ): VRef {
    let eref = krefToEref(vatId, kref);
    if (!eref) {
      if (importIfNeeded) {
        eref = allocateErefForKref(vatId, kref);
      } else {
        throw Fail`unmapped kref ${kref} vat=${vatId}`;
      }
    }
    return eref;
  }

  /**
   * Translate a capdata object from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to `vatId`.
   */
  function translateCapDataKtoV(
    vatId: VatId,
    capdata: CapData<KRef>,
  ): CapData<VRef> {
    const slots: VRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(translateRefKtoV(vatId, slot, true));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from kernel space into vat space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to `vatId`.
   */
  function translateMessageKtoV(vatId: VatId, message: Message): Message {
    const methargs = translateCapDataKtoV(
      vatId,
      message.methargs as CapData<KRef>,
    );
    const result = message.result
      ? translateRefKtoV(vatId, message.result, true)
      : message.result;
    const vatMessage = { ...message, methargs, result };
    return vatMessage;
  }

  /**
   * Translate a reference from vat space into kernel space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param vref - The VRef of the entity of interest.
   *
   * @returns the KRef corresponding to `vref` in this vat.
   */
  function translateRefVtoK(vatId: VatId, vref: VRef): KRef {
    let kref = erefToKref(vatId, vref);
    kref ??= exportFromVat(vatId, vref);
    return kref;
  }

  /**
   * Translate a capdata object from vat space into kernel space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param capdata - The object to be translated.
   *
   * @returns a translated copy of `capdata` intelligible to the kernel.
   */
  function translateCapDataVtoK(
    vatId: VatId,
    capdata: CapData<VRef>,
  ): CapData<KRef> {
    const slots: KRef[] = [];
    for (const slot of capdata.slots) {
      slots.push(translateRefVtoK(vatId, slot));
    }
    return { body: capdata.body, slots };
  }

  /**
   * Translate a message from vat space into kernel space.
   *
   * @param vatId - The vat for whom translation is desired.
   * @param message - The message to be translated.
   *
   * @returns a translated copy of `message` intelligible to the kernel.
   */
  function translateMessageVtoK(vatId: VatId, message: Message): Message {
    const methargs = translateCapDataVtoK(
      vatId,
      message.methargs as CapData<VRef>,
    );
    if (typeof message.result !== 'string') {
      throw TypeError(`message result must be a string`);
    }
    const result = translateRefVtoK(vatId, message.result);
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
          translateRefVtoK(vatId, target),
          translateMessageVtoK(vatId, coerceMessage(message)),
        ];
        break;
      }
      case 'subscribe': {
        // [VRef];
        const [op, promise] = vso;
        kso = [op, translateRefVtoK(vatId, promise)];
        break;
      }
      case 'resolve': {
        // [VatOneResolution[]];
        const [op, resolutions] = vso;
        const kResolutions: VatOneResolution[] = resolutions.map(
          (resolution) => {
            const [vpid, rejected, data] = resolution;
            return [
              translateRefVtoK(vatId, vpid),
              rejected,
              translateCapDataVtoK(vatId, data as CapData<VRef>),
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
          translateCapDataVtoK(vatId, info as CapData<VRef>),
        ];
        break;
      }
      case 'dropImports':
      case 'retireImports':
      case 'retireExports':
      case 'abandonExports': {
        // [VRef[]];
        const [op, vrefs] = vso;
        const krefs = vrefs.map((ref) => translateRefVtoK(vatId, ref));
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
    translateRefKtoV,
    translateCapDataKtoV,
    translateMessageKtoV,
    translateSyscallVtoK,
  };
}
