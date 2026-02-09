import { Far } from '@endo/marshal';

import { parseOcapURL } from './remote-comms.ts';
import type { RemoteManager } from './RemoteManager.ts';
import { kslot, krefOf } from '../../liveslots/kernel-marshal.ts';
import type { SlotValue } from '../../liveslots/kernel-marshal.ts';
import type { KRef } from '../../types.ts';

type OcapURLManagerConstructorProps = {
  remoteManager: RemoteManager;
};

/**
 * Manages OCAP URL issuing and redemption.
 */
export class OcapURLManager {
  /** Remote manager for handling remote connections */
  readonly #remoteManager: RemoteManager;

  /** OCAP URL issuer service object */
  readonly #ocapURLIssuerService: object;

  /** OCAP URL redemption service object */
  readonly #ocapURLRedemptionService: object;

  /**
   * Creates a new OcapURLManager instance.
   *
   * @param options - Constructor options.
   * @param options.remoteManager - The remote manager for handling cross-kernel communications.
   */
  constructor({ remoteManager }: OcapURLManagerConstructorProps) {
    this.#remoteManager = remoteManager;

    // Create the OCAP URL issuer service
    this.#ocapURLIssuerService = Far('ocapURLIssuerService', {
      issue: async (obj: SlotValue): Promise<string> => {
        let kref: string;
        try {
          kref = krefOf(obj);
        } catch {
          throw Error('Argument must be a remotable');
        }
        return await this.issueOcapURL(kref);
      },
    });

    // Create the OCAP URL redemption service
    this.#ocapURLRedemptionService = Far('ocapURLRedemptionService', {
      redeem: async (url: string): Promise<SlotValue> => {
        return kslot(await this.redeemOcapURL(url));
      },
    });
  }

  /**
   * Get the OCAP URL services for registration.
   * This should be called during kernel initialization.
   *
   * @returns An object containing the services with their names.
   */
  getServices(): {
    issuerService: { name: string; service: object };
    redemptionService: { name: string; service: object };
  } {
    return {
      issuerService: {
        name: 'ocapURLIssuerService',
        service: this.#ocapURLIssuerService,
      },
      redemptionService: {
        name: 'ocapURLRedemptionService',
        service: this.#ocapURLRedemptionService,
      },
    };
  }

  /**
   * Get the issuer service object.
   *
   * @returns the issuer service object.
   */
  getIssuerService(): object {
    return this.#ocapURLIssuerService;
  }

  /**
   * Get the redemption service object.
   *
   * @returns the redemption service object.
   */
  getRedemptionService(): object {
    return this.#ocapURLRedemptionService;
  }

  /**
   * Issue an OCAP URL for a kernel reference.
   *
   * @param kref - The kref of the object to issue an OCAP URL for.
   * @returns a promise for the OCAP URL.
   * @throws if remote identity is not initialized.
   */
  async issueOcapURL(kref: KRef): Promise<string> {
    const identity = this.#remoteManager.getRemoteIdentity();
    return identity.issueOcapURL(kref);
  }

  /**
   * Redeem an OCAP URL to get the kernel reference it represents.
   *
   * @param url - The OCAP URL to redeem.
   * @returns a promise for the kref of the object referenced by the OCAP URL.
   * @throws if the URL is invalid or remote identity is not initialized.
   */
  async redeemOcapURL(url: string): Promise<string> {
    const identity = this.#remoteManager.getRemoteIdentity();
    const { host, hints } = parseOcapURL(url);

    if (host === identity.getPeerId()) {
      // This is a local OCAP URL
      return identity.redeemLocalOcapURL(url);
    }

    // This is a remote OCAP URL — requires full remote comms
    const remote = this.#remoteManager.remoteFor(host, hints);
    return remote.redeemOcapURL(url);
  }
}
