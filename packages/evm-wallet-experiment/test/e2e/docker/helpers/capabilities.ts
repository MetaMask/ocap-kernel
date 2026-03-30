import { capability } from '@ocap/kernel-agents/capabilities/capability';
import type { CapabilityRecord } from '@ocap/kernel-agents/types';

type CallAway = (
  kref: string,
  method: string,
  args?: unknown[],
) => Promise<unknown>;

/**
 * Build the wallet capability set for an agent operating against the away coordinator.
 *
 * @param callAway - Function to invoke a method on a vat in the away container.
 * @param awayCoordKref - Kref of the away coordinator vat.
 * @returns A capability record suitable for passing to {@link makeChatAgent}.
 */
export function makeWalletCapabilities(
  callAway: CallAway,
  awayCoordKref: string,
): CapabilityRecord {
  const balance = capability(
    async () => {
      const accounts = (await callAway(
        awayCoordKref,
        'getAccounts',
      )) as string[];
      const raw = (await callAway(awayCoordKref, 'request', [
        'eth_getBalance',
        [accounts[0], 'latest'],
      ])) as string;
      return `Balance: ${(parseInt(raw, 16) / 1e18).toFixed(4)} ETH`;
    },
    {
      description: 'Get the ETH balance of the wallet',
      args: {},
      returns: { type: 'string' },
    },
  );

  const accounts = capability(
    async () => {
      const addrs = (await callAway(awayCoordKref, 'getAccounts')) as string[];
      return `Accounts: ${addrs.join(', ')}`;
    },
    {
      description: 'Get wallet accounts/addresses',
      args: {},
      returns: { type: 'string' },
    },
  );

  const send = capability(
    async ({ to, value }: { to: string; value: string }) => {
      const addrs = (await callAway(awayCoordKref, 'getAccounts')) as string[];
      const weiValue = `0x${(parseFloat(value || '0.01') * 1e18).toString(16)}`;
      const txHash = await callAway(awayCoordKref, 'request', [
        'eth_sendTransaction',
        [
          {
            from: addrs[0],
            to: to || '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
            value: weiValue,
          },
        ],
      ]);
      return `Transaction sent: ${txHash as string}`;
    },
    {
      description: 'Send ETH to an address',
      args: { to: { type: 'string' }, value: { type: 'string' } },
      returns: { type: 'string' },
    },
  );

  const sign = capability(
    async ({ message }: { message: string }) => {
      const signature = await callAway(awayCoordKref, 'signMessage', [
        message || 'test',
      ]);
      return `Signature: ${signature as string}`;
    },
    {
      description: 'Sign a message with the wallet',
      args: { message: { type: 'string' } },
      returns: { type: 'string' },
    },
  );

  return {
    wallet_balance: balance,
    wallet_accounts: accounts,
    wallet_send: send,
    wallet_sign: sign,
  };
}
