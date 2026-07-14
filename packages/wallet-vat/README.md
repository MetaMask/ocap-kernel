# `@ocap/wallet-vat`

A persistent integer-cents wallet vat for the orchestration demo.

Replaces the demo's process-local mock wallet with a real vat-hosted
balance that the producer LLM cannot narrate its way around. Amounts
are always integer USD cents; callers converting from dollars must
handle the boundary themselves. The balance is durable in vat
baggage — vat re-incarnation restores the last committed value.

## API

The vat's public facet exposes four methods:

- `deposit(amount: number): number` — add funds. Returns the new
  balance. Rejects non-integer, non-cents, or negative amounts.
- `withdraw(amount: number): [Money, number]` — take funds out.
  Returns `[Money, newBalance]`. Rejects overdrafts, negative
  amounts, and zero. The `Money` object is what a caller then
  passes as `payment` to a service call; the service validates
  amount (and, in a future revision, `auth`) before performing
  costed work.
- `balance(): number` — the current balance in cents.
- `init(amount: number): void` — reset the balance to a known
  value. Used at the start of a demo run to put the wallet into
  a predictable state.

The `Money` type is:

```ts
type Money = {
  amount: number; // integer USD cents
  auth: string; // opaque validation nonce (see below)
};
```

## Auth

`Money.auth` is currently a short random nonce generated at
withdraw-time. A future revision will replace it with a
cryptographic proof (either a signature from the wallet's own key
or an encrypted amount using a shared key that services trust and
the producer LLM doesn't hold), turning the value from
scaffolding into a real payment authentication. For the current
demo, the honest behaviour of the wallet plus the service-side
amount check is enough to eliminate the "the LLM is narrating
balances that don't match reality" failure mode.

## Discovery

The wallet vat's root object issues an OCAP URL at `bootstrap`
time. That URL redeems to the public facet. Callers (in the
demo, the openclaw `demo` plugin) redeem the URL to obtain a
presence they can invoke wallet methods on via CapTP / `E()`.

The URL is deterministic over (kref, peer ID, ocap-URL key) and
persists across daemon restarts — same guarantee as the matcher
URL.
