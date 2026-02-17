import type {
  TransactionSerializableEIP1559,
  TransactionSerializableLegacy,
} from 'viem';
import type { LocalAccount } from 'viem/accounts';

import type { Eip712TypedData, Hex, TransactionRequest } from '../types.ts';

/**
 * Sign a transaction with the given account.
 *
 * @param options - Signing options.
 * @param options.account - The local account to sign with.
 * @param options.tx - The transaction request.
 * @returns The signed transaction as a hex string.
 */
export async function signTransaction(options: {
  account: LocalAccount;
  tx: TransactionRequest;
}): Promise<Hex> {
  const { account, tx } = options;

  if (tx.maxFeePerGas) {
    const eip1559Tx = {
      to: tx.to,
      type: 'eip1559' as const,
      maxFeePerGas: BigInt(tx.maxFeePerGas),
      ...(tx.value === undefined ? {} : { value: BigInt(tx.value) }),
      ...(tx.data === undefined ? {} : { data: tx.data }),
      ...(tx.nonce === undefined ? {} : { nonce: tx.nonce }),
      ...(tx.gasLimit === undefined ? {} : { gas: BigInt(tx.gasLimit) }),
      ...(tx.chainId === undefined ? {} : { chainId: tx.chainId }),
      ...(tx.maxPriorityFeePerGas === undefined
        ? {}
        : { maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas) }),
    } as TransactionSerializableEIP1559;
    return account.signTransaction(eip1559Tx);
  }

  const legacyTx = {
    to: tx.to,
    type: 'legacy' as const,
    ...(tx.value === undefined ? {} : { value: BigInt(tx.value) }),
    ...(tx.data === undefined ? {} : { data: tx.data }),
    ...(tx.nonce === undefined ? {} : { nonce: tx.nonce }),
    ...(tx.gasLimit === undefined ? {} : { gas: BigInt(tx.gasLimit) }),
    ...(tx.chainId === undefined ? {} : { chainId: tx.chainId }),
    ...(tx.gasPrice === undefined ? {} : { gasPrice: BigInt(tx.gasPrice) }),
  } as TransactionSerializableLegacy;
  return account.signTransaction(legacyTx);
}

/**
 * Sign a message using EIP-191 personal sign.
 *
 * @param options - Signing options.
 * @param options.account - The local account to sign with.
 * @param options.message - The message to sign.
 * @returns The signature as a hex string.
 */
export async function signMessage(options: {
  account: LocalAccount;
  message: string;
}): Promise<Hex> {
  const { account, message } = options;
  return account.signMessage({ message });
}

/**
 * Sign EIP-712 typed data.
 *
 * @param options - Signing options.
 * @param options.account - The local account to sign with.
 * @param options.typedData - The EIP-712 typed data payload.
 * @returns The signature as a hex string.
 */
export async function signTypedData(options: {
  account: LocalAccount;
  typedData: Eip712TypedData;
}): Promise<Hex> {
  const { account, typedData } = options;
  return account.signTypedData({
    domain: typedData.domain as Record<string, unknown>,
    types: typedData.types as Record<string, { name: string; type: string }[]>,
    primaryType: typedData.primaryType,
    message: typedData.message,
  });
}
