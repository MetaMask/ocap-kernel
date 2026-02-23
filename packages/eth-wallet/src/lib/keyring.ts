import { keccak256, encodePacked } from 'viem';
import {
  english,
  generateMnemonic,
  mnemonicToAccount,
  privateKeyToAccount,
  generatePrivateKey,
} from 'viem/accounts';
import type { HDAccount, LocalAccount } from 'viem/accounts';

import type { Address, Hex } from '../types.ts';

const harden = globalThis.harden ?? (<T>(value: T): T => value);

// Counter for throwaway key generation in SES environments.
let throwawayCounter = 0;

/**
 * Options for initializing a keyring.
 */
export type KeyringInitOptions =
  | { type: 'srp'; mnemonic: string }
  | { type: 'throwaway' };

/**
 * A keyring manages private keys and signing. Keys never leave this module.
 */
export type Keyring = {
  getAccounts: () => Address[];
  deriveAccount: (index: number) => Address;
  getAccount: (address: Address) => LocalAccount | undefined;
  hasKeys: () => boolean;
  getMnemonic: () => string | undefined;
};

/**
 * Create a new keyring from an SRP mnemonic or a throwaway key.
 *
 * @param options - Initialization options.
 * @returns The keyring instance.
 */
export function makeKeyring(options: KeyringInitOptions): Keyring {
  const accounts = new Map<Address, LocalAccount>();
  let mnemonic: string | undefined;

  if (options.type === 'srp') {
    mnemonic = options.mnemonic;
    // Derive the first account by default
    deriveAccountInternal(0);
  } else {
    // Generate a throwaway private key.
    // In SES compartments crypto.getRandomValues is unavailable, so fall
    // back to a keccak256-based key derived from a timestamp counter.
    // Throwaway keys only need uniqueness, not cryptographic strength.
    let privateKey: Hex;
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    if (globalThis.crypto?.getRandomValues) {
      privateKey = generatePrivateKey();
    } else {
      throwawayCounter += 1;
      privateKey = keccak256(
        encodePacked(['uint256'], [BigInt(throwawayCounter)]),
      );
    }
    const account = privateKeyToAccount(privateKey);
    accounts.set(account.address.toLowerCase() as Address, account);
  }

  /**
   * Derive an account at the given BIP-44 index.
   *
   * @param index - The address index to derive.
   * @returns The derived account address.
   */
  function deriveAccountInternal(index: number): Address {
    if (!mnemonic) {
      throw new Error('Cannot derive accounts from a throwaway keyring');
    }
    const account: HDAccount = mnemonicToAccount(mnemonic, {
      addressIndex: index,
    });
    const address = account.address.toLowerCase() as Address;
    accounts.set(address, account);
    return address;
  }

  return harden({
    getAccounts(): Address[] {
      return [...accounts.keys()];
    },

    deriveAccount(index: number): Address {
      return deriveAccountInternal(index);
    },

    getAccount(address: Address): LocalAccount | undefined {
      return accounts.get(address.toLowerCase() as Address);
    },

    hasKeys(): boolean {
      return accounts.size > 0;
    },

    getMnemonic(): string | undefined {
      return mnemonic;
    },
  });
}

/**
 * Generate a new random BIP-39 mnemonic phrase (12 words).
 *
 * @returns The mnemonic string.
 */
export function generateMnemonicPhrase(): string {
  return generateMnemonic(english);
}
