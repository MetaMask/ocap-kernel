import { formatUsd } from '../format.ts';

type WalletRibbonProps = {
  balanceUsd: number | undefined;
};

/**
 * Always-visible wallet ribbon. Shows the inventor's current USD
 * balance. Driven by `wallet.balance` events from the demo plugin —
 * the plugin emits one at register time and again whenever the
 * balance changes (mock-wallet service will become the source of
 * truth in a later commit).
 *
 * @param props - Component props.
 * @param props.balanceUsd - The current balance, or `undefined`
 *   before any `wallet.balance` event has been received.
 * @returns The rendered ribbon.
 */
export function WalletRibbon(props: WalletRibbonProps): JSX.Element {
  const { balanceUsd } = props;
  return (
    <div className="wallet-ribbon">
      <span className="wallet-ribbon__label">Wallet</span>
      <span className="wallet-ribbon__balance">
        {balanceUsd === undefined ? '—' : formatUsd(balanceUsd)}
      </span>
    </div>
  );
}
