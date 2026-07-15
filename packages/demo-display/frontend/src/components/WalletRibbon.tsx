import { formatUsdFromCents } from '../format.ts';

type WalletRibbonProps = {
  balanceCents: number | undefined;
};

/**
 * Always-visible wallet ribbon. Shows the inventor's current wallet
 * balance, formatted from the integer-cents payload carried on
 * `wallet.balance` events emitted by the demo plugin (which pulls
 * from the wallet vat).
 *
 * @param props - Component props.
 * @param props.balanceCents - The current balance in integer USD
 *   cents, or `undefined` before any `wallet.balance` event has been
 *   received.
 * @returns The rendered ribbon.
 */
export function WalletRibbon(props: WalletRibbonProps): JSX.Element {
  const { balanceCents } = props;
  return (
    <div className="wallet-ribbon">
      <span className="wallet-ribbon__label">Wallet</span>
      <span className="wallet-ribbon__balance">
        {balanceCents === undefined ? '—' : formatUsdFromCents(balanceCents)}
      </span>
    </div>
  );
}
