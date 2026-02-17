import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import type { Baggage } from '@metamask/ocap-kernel';

import { makeKeyring } from '../lib/keyring.ts';
import type { Keyring, KeyringInitOptions } from '../lib/keyring.ts';
import {
  signHash,
  signTransaction,
  signMessage,
  signTypedData,
} from '../lib/signing.ts';
import type {
  Address,
  Eip712TypedData,
  Hex,
  TransactionRequest,
} from '../types.ts';

/**
 * Vat powers for the keyring vat.
 */
type VatPowers = Record<string, unknown>;

/**
 * Build the root object for the keyring vat.
 *
 * The keyring vat isolates private keys. Keys never leave this vat.
 * Other vats send unsigned payloads and receive signed bytes.
 *
 * @param _vatPowers - Special powers granted to this vat.
 * @param _parameters - Initialization parameters.
 * @param baggage - Root of vat's persistent state.
 * @returns The root object for the keyring vat.
 */
export function buildRootObject(
  _vatPowers: VatPowers,
  _parameters: unknown,
  baggage: Baggage,
): object {
  let keyring: Keyring | undefined;

  // Restore keyring from baggage if previously initialized
  if (baggage.has('keyringInit')) {
    const initOptions = baggage.get('keyringInit') as KeyringInitOptions;
    keyring = makeKeyring(initOptions);

    // Re-derive previously derived accounts
    if (baggage.has('accountCount')) {
      const count = baggage.get('accountCount') as number;
      for (let i = 1; i < count; i++) {
        keyring.deriveAccount(i);
      }
    }
  }

  return makeDefaultExo('walletKeyring', {
    async bootstrap(): Promise<void> {
      // No services needed for the keyring vat
    },

    async initialize(options: KeyringInitOptions): Promise<void> {
      if (keyring) {
        throw new Error('Keyring already initialized');
      }
      keyring = makeKeyring(options);

      // Persist the init options so keyring can be rebuilt on resuscitation
      if (baggage.has('keyringInit')) {
        baggage.set('keyringInit', options);
      } else {
        baggage.init('keyringInit', options);
      }
    },

    async hasKeys(): Promise<boolean> {
      return keyring?.hasKeys() ?? false;
    },

    async deriveAccount(index: number): Promise<Address> {
      if (!keyring) {
        throw new Error('Keyring not initialized');
      }
      const address = keyring.deriveAccount(index);

      // Persist the derived account count
      const accounts = keyring.getAccounts();
      if (baggage.has('accountCount')) {
        baggage.set('accountCount', accounts.length);
      } else {
        baggage.init('accountCount', accounts.length);
      }

      return address;
    },

    async getAccounts(): Promise<Address[]> {
      if (!keyring) {
        return [];
      }
      return keyring.getAccounts();
    },

    async signTransaction(tx: TransactionRequest): Promise<Hex> {
      if (!keyring) {
        throw new Error('Keyring not initialized');
      }
      const account = keyring.getAccount(tx.from);
      if (!account) {
        throw new Error(`No key for account ${tx.from}`);
      }
      return signTransaction({ account, tx });
    },

    async signTypedData(typedData: Eip712TypedData): Promise<Hex> {
      if (!keyring) {
        throw new Error('Keyring not initialized');
      }
      // Use the first account for typed data signing
      const accounts = keyring.getAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts available');
      }
      const account = keyring.getAccount(accounts[0] as Address);
      if (!account) {
        throw new Error('Account not found');
      }
      return signTypedData({ account, typedData });
    },

    async signHash(hash: Hex, from?: Address): Promise<Hex> {
      if (!keyring) {
        throw new Error('Keyring not initialized');
      }
      const accounts = keyring.getAccounts();
      const address = from ?? accounts[0];
      if (!address) {
        throw new Error('No accounts available');
      }
      const account = keyring.getAccount(address);
      if (!account) {
        throw new Error(`No key for account ${address}`);
      }
      return signHash({ account, hash });
    },

    async signMessage(message: string, from?: Address): Promise<Hex> {
      if (!keyring) {
        throw new Error('Keyring not initialized');
      }
      const accounts = keyring.getAccounts();
      const address = from ?? accounts[0];
      if (!address) {
        throw new Error('No accounts available');
      }
      const account = keyring.getAccount(address);
      if (!account) {
        throw new Error(`No key for account ${address}`);
      }
      return signMessage({ account, message });
    },
  });
}
