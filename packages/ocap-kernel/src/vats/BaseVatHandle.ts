import type { VatOneResolution } from '@agoric/swingset-liveslots';

import type { CrankResults, Message, VRef, EndpointHandle } from '../types.ts';
import type { VatSyscall } from './VatSyscall.ts';

/**
 * Delivery object type using our Message type (with optional result).
 */
export type DeliveryObject =
  | ['message', VRef, Message]
  | ['notify', VatOneResolution[]]
  | ['dropExports', VRef[]]
  | ['retireExports', VRef[]]
  | ['retireImports', VRef[]]
  | ['bringOutYourDead'];

/**
 * Function type for delivering messages to a vat.
 *
 * @param delivery - The delivery object to send to the vat.
 * @returns A promise that resolves to the delivery error (or null if no error).
 */
export type DeliverFn = (delivery: DeliveryObject) => Promise<string | null>;

/**
 * Abstract base class for vat handles.
 *
 * Implements the delivery methods shared between VatHandle and SystemVatHandle.
 * Subclasses provide a deliver function that handles transport-specific logic.
 */
export abstract class BaseVatHandle implements EndpointHandle {
  readonly #vatSyscall: VatSyscall;

  protected deliver: DeliverFn | undefined;

  /**
   * Construct a new BaseVatHandle instance.
   *
   * @param vatSyscall - The vat's syscall handler.
   */
  protected constructor(vatSyscall: VatSyscall) {
    this.#vatSyscall = vatSyscall;
  }

  /**
   * Get the vat syscall handler.
   *
   * @returns The vat syscall handler.
   */
  protected get vatSyscall(): VatSyscall {
    return this.#vatSyscall;
  }

  /**
   * Perform a delivery and get crank results.
   *
   * @param delivery - The delivery object.
   * @returns The crank results.
   */
  async #doDeliver(delivery: DeliveryObject): Promise<CrankResults> {
    if (!this.deliver) {
      throw new Error(
        'deliver function not set - subclass must call setDeliver()',
      );
    }
    const deliveryError = await this.deliver(delivery);
    return this.#vatSyscall.getCrankResults(deliveryError);
  }

  /**
   * Make a 'message' delivery to the vat.
   *
   * @param target - The VRef of the object to which the message is addressed.
   * @param message - The message to deliver.
   * @returns The crank results.
   */
  async deliverMessage(target: VRef, message: Message): Promise<CrankResults> {
    return await this.#doDeliver(['message', target, message]);
  }

  /**
   * Make a 'notify' delivery to the vat.
   *
   * @param resolutions - One or more promise resolutions to deliver.
   * @returns The crank results.
   */
  async deliverNotify(resolutions: VatOneResolution[]): Promise<CrankResults> {
    return await this.#doDeliver(['notify', resolutions]);
  }

  /**
   * Make a 'dropExports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the exports to be dropped.
   * @returns The crank results.
   */
  async deliverDropExports(vrefs: VRef[]): Promise<CrankResults> {
    return await this.#doDeliver(['dropExports', vrefs]);
  }

  /**
   * Make a 'retireExports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the exports to be retired.
   * @returns The crank results.
   */
  async deliverRetireExports(vrefs: VRef[]): Promise<CrankResults> {
    return await this.#doDeliver(['retireExports', vrefs]);
  }

  /**
   * Make a 'retireImports' delivery to the vat.
   *
   * @param vrefs - The VRefs of the imports to be retired.
   * @returns The crank results.
   */
  async deliverRetireImports(vrefs: VRef[]): Promise<CrankResults> {
    return await this.#doDeliver(['retireImports', vrefs]);
  }

  /**
   * Make a 'bringOutYourDead' delivery to the vat.
   *
   * @returns The crank results.
   */
  async deliverBringOutYourDead(): Promise<CrankResults> {
    return await this.#doDeliver(['bringOutYourDead']);
  }
}
