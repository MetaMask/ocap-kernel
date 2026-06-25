# Orchestration demo — wallet via ocap

Design sketch for replacing the orchestration demo's simulated
wallet with a real one. The end state is that the inventor's
wallet lives inside the MetaMask browser extension's ocap kernel,
the producer agent holds nothing more than narrowly-scoped
payment ocaps, and every actual charge surfaces in the
MetaMask UI for user approval.

This is a planning document, not a spec. It captures the shape of
the work and the trade-offs we should be making explicitly, so
later passes can stay aligned even when individual mechanics
change.

---

## 1. What we have today (V0)

The "wallet" in the current demo is a JavaScript number living in
the openclaw demo plugin's process memory
(`packages/agentmask/openclaw-plugin-demo/state.ts`). Three tools
mediate access:

- `demo_wallet_balance` — read the current balance.
- `demo_wallet_charge` — deduct an amount. The agent calls this
  itself after each `service_call` that incurs a cost.
- `demo_wallet_credit` — add an amount. The agent calls this when
  the simulated inventor "tops up" mid-run.

There is no authorization step. The agent is fully trusted to debit
and credit at will. The demo-display dashboard renders the running
balance from `wallet.charge` / `wallet.balance` SSE events the
plugin emits when these tools fire. The whole arrangement is a
prop, calibrated to make the cost narrative legible to the
audience.

Limitations the design has to address:

- **Trust scope** — a real producer agent should not be able to
  move real funds without an explicit per-transaction
  authorization step. V0 conflates the agent's "intent to charge"
  with the actual debit.
- **Sequencing illusions** — run-11 surfaced narrative glitches
  where the agent claimed work was "ready to deliver" before the
  inventor had topped up the wallet. Real money introduces a real
  ordering constraint: the supplier should not perform work it
  hasn't been paid for. V0's freedom to reorder is a side effect
  of the prop.
- **Provenance** — V0 charges have no on-chain identity, no
  receipts, and no audit trail beyond the demo-display SSE log.

## 2. Target architecture

```
   ┌──────────────── MetaMask browser extension ────────────────┐
   │                                                            │
   │   ┌────────── ocap kernel (in the extension) ──────────┐   │
   │   │                                                    │   │
   │   │   ┌─ wallet vat ─────────────────────────────┐     │   │
   │   │   │  • balance accessor (read-only ocap)     │     │   │
   │   │   │  • charge-authority issuer (admin facet) │     │   │
   │   │   │  • per-charge authorization queue        │     │   │
   │   │   └──────────────────────────────────────────┘     │   │
   │   │                  ▲                                 │   │
   │   │                  │ E()                             │   │
   │   │                  │                                 │   │
   │   └──────────────────│─────────────────────────────────┘   │
   │                      │ CapTP                               │
   └──────────────────────┼─────────────────────────────────────┘
                          │
                          │ relay (libp2p)
                          │
   ┌──────────── VPS (matcher + producer LLM) ────────┐
   │                                                  │
   │   producer agent ──┬──► payment-request ocap     │
   │                    │     (revocable, narrow)     │
   │                    │                             │
   │                    └──► wallet observer ocap     │
   │                          (read-only)             │
   └──────────────────────────────────────────────────┘
```

A wallet vat inside the extension's ocap kernel is the source of
truth for balance and the only thing that can mutate it. It
exposes two kinds of capabilities:

1. **Observer capability** — read-only, freely shared. The
   demo-display dashboard and the producer agent both hold one,
   redeemed from a URL emitted at wallet-vat bootstrap. Resolves
   to a presence whose `getBalance()` returns the current balance
   plus a low-rate change stream so the dashboard can update
   reactively instead of polling.

2. **Payment-request capability** — narrowly-scoped, per-engagement.
   The agent holds one of these per supplier interaction, not a
   single all-powerful "charge" handle. Each capability is a
   presence with one method:
   `requestCharge({ amountUsd, recipient, memo }) → Promise<Receipt>`.
   Invoking it doesn't move funds. It enqueues an authorization
   request that surfaces in the MetaMask UI. The promise resolves
   when (a) the user approves and the wallet vat completes the
   transfer, or (b) the user rejects, in which case the promise
   rejects with a typed error the agent can recover from.

The agent never holds a "general charge" capability, and the user
sees every charge before it happens.

## 3. Trust boundaries

Per principal, what each one is allowed to do:

| Principal              | Can read balance | Can request charge | Can authorize charge |
| ---------------------- | ---------------- | ------------------ | -------------------- |
| Producer agent (away)  | yes (observer)   | yes (per-request)  | no                   |
| Demo-display dashboard | yes (observer)   | no                 | no                   |
| Service vat (laptop)   | no               | no                 | no                   |
| Inventor (in MetaMask) | yes (UI)         | n/a                | yes                  |
| MetaMask extension     | yes              | n/a                | renders + relays UI  |

The agent's narrowly-scoped payment-request ocap is what gives it
the affordance to ask for money on behalf of a specific
engagement. The wallet vat is what actually authorizes the spend,
gated on the user's tap in the MetaMask UI.

Service vats don't hold any wallet caps. Payment for service work
flows through the agent: supplier quotes a price → agent invokes
the engagement's payment-request ocap → user approves in MetaMask
→ wallet emits a receipt ocap → agent hands the receipt to the
supplier in the next `service_call`. The supplier holds a
receipt-verification capability (separate ocap, issued by the
wallet vat) to confirm receipts before performing work.

This swaps "trust the agent" for "trust the wallet vat, which
verifies signatures the user produced". The agent becomes a
courier, not an authority.

## 4. Capability flow

End-to-end for a single service interaction:

1. **Engagement begins.** The agent decides to commission
   industrial-design work. It invokes
   `wallet.requestPaymentAuthority({ engagementId, maxUsd, validUntil })`
   on its admin-side wallet ocap (acquired at boot from a
   well-known URL the inventor pre-redeems into the agent's
   namespace). The wallet vat returns a fresh payment-request
   ocap scoped to that engagement.
2. **Quote.** The agent runs `service_call industrial-design.quote`
   and receives a `{ priceUsd, paymentTo, memo }` reply.
3. **Charge request.** The agent invokes
   `paymentRequest.requestCharge({ amountUsd: priceUsd, recipient: paymentTo, memo })`.
   This enqueues an authorization in the wallet vat, which posts
   it to the MetaMask UI.
4. **User approval.** The inventor taps Approve. The wallet vat
   decrements the balance, emits a `wallet.charge` event to the
   demo-display SSE (via the dashboard's observer ocap stream),
   and resolves the agent's promise with a signed `Receipt`.
5. **Service execution.** The agent runs
   `service_call industrial-design.commit({ receipt })`. The
   supplier vat invokes its receipt-verification ocap, gets back
   `{ valid: true, amountUsd, engagementId }`, and proceeds with
   the work.
6. **Engagement closes.** Either side may revoke the
   payment-request ocap. The agent revokes it once the
   engagement's invoices are settled. The wallet vat revokes it
   automatically when `validUntil` lapses or `maxUsd` is hit.

The agent has one payment-request ocap per supplier engagement.
Receipts are bearer tokens scoped to a single charge but include
the engagement id so suppliers can correlate payment to work.

## 5. UI and authorization

The MetaMask side runs an extension-resident view of pending
authorization requests. Default behavior:

- Each pending request appears in the MetaMask popup as a normal
  transaction-confirmation card: amount, recipient, memo,
  engagement id, "approve / reject" buttons.
- Approvals are atomic per charge. There is no "approve all"
  shortcut for now; if the demo's UX makes that necessary later,
  it should be opt-in per session and prominently surfaced.
- Rejections are typed and recoverable. The agent's promise
  rejects with a `PaymentRejectedError` carrying the reason
  (`user_rejected`, `expired`, `over_limit`); the agent reports
  the rejection back to the inventor in the producer-dialog pane
  and asks how to proceed.

Open question: how the popup gets surfaced when the inventor is
focused on the dashboard, not the extension. Possible answers
range from a dashboard badge that opens the popup on click to a
push-toast extension API. Leave this for the implementation pass —
the design just needs to know the affordance exists.

## 6. Migration path

The three V0 tools map to ocap operations rather than going away
entirely:

| V0 tool               | Becomes                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `demo_wallet_balance` | tool that wraps `E(observerOcap).getBalance()`                   |
| `demo_wallet_charge`  | tool that wraps `E(paymentRequestOcap).requestCharge(...)`       |
| `demo_wallet_credit`  | removed — top-ups happen through MetaMask, not through the agent |

The agent's prompt (`SKILL.md`) needs an updated wallet section
that:

- Removes the language about the agent "deducting" from the
  wallet (agent never deducts).
- Frames `demo_wallet_charge` as "requesting payment authorization"
  with the user's tap as the actual approval.
- Drops `demo_wallet_credit` and replaces the "request a top-up"
  guidance with "ask the inventor to top up in MetaMask, then
  retry the charge".

Implementation order, smallest reversible step first:

1. **Wallet vat scaffold.** A wallet vat that lives in the
   extension's kernel, exposes observer + payment-request
   capability factories, but with the authorization step stubbed
   (auto-approve everything). Demo plumbing migrates onto these
   capabilities; behavior remains the V0 narrative.
2. **Receipt issuance + verification.** Wire receipts into
   service-vat `commit` paths. Suppliers refuse work without a
   valid receipt.
3. **Authorization UI.** Replace the auto-approve stub with a
   real MetaMask popup card. This is the largest unknown — most
   of the implementation risk lives in the
   extension-popup-from-vat plumbing.
4. **Revocation + scope limits.** `validUntil`, `maxUsd`, agent-
   initiated revoke.
5. **Top-up flow.** Real MetaMask-side mechanism for adding
   funds; remove `demo_wallet_credit`.

Each step is independently demoable. The producer narrative
survives even if we stop after step 1 — the difference is
invisible to the audience but real for trust posture.

## 7. Related work

- `packages/evm-wallet-experiment` — the two-device delegation
  architecture (home holds keys, away gets a signed delegation).
  Wallet-vat plumbing here should reuse the keyring / delegation
  separation pattern. The orchestration demo's wallet vat is a
  third use case alongside that experiment's home and away vats.
- `packages/agentmask/openclaw-plugin-metamask` — existing
  MetaMask extension integration; the popup-surfacing work in
  step 3 is most likely an extension here, not a fresh build.

## 8. Open questions to revisit in the implementation pass

- How does the agent receive its initial admin-side wallet ocap?
  Bootstrap-time URL redemption is the obvious answer but exposes
  a security surface (anyone holding the URL could request
  authority). Likely answer: the URL is generated at session
  start, embedded in the producer-skill load payload, and revoked
  at session end.
- What's the right scope for payment-request ocaps? Per
  engagement is the proposal here; per service-call would be more
  conservative but more chatty.
- How do refunds work? V0 has no concept. Likely:
  `paymentRequest.requestRefund(receipt)` enqueues a separate
  authorization the user can approve, with the receipt as
  evidence.
- Multi-currency. V0 is USD-only by fiat. Real wallet flows
  introduce token/network selection; the design has to decide
  whether the demo will exercise that or stay USD-pegged for
  audience clarity.

Document owner: the orchestration-demo plan, until the wallet vat
ships and this gets folded into actual code docs.
