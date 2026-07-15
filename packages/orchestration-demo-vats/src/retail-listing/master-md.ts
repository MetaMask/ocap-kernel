/**
 * Master markdown for the retail-listing service.
 *
 * Token catalog:
 *   {{providerLabel}}    provider identifier
 *   {{retailPrice}}      headline price, e.g. "$59.99"
 *   {{tier}}             pricing tier label, e.g. "Standard"
 *   {{leadDays}}         shipping window, e.g. "5 business days"
 *   {{warrantyMonths}}   warranty term, e.g. "12 months"
 */
export const MASTER_MD = `# Retail listing — LAUR

## Storefront copy

**Title:** LAUR — the less annoying universal remote

**Tagline:** Voice handles the complicated stuff. Physical keys
handle everything you actually press every day.

**Long description:**

Most universal remotes give you fifty buttons and ask you to remember
what they all do. The LAUR has eight buttons — power, mute, vol up,
vol down, four-way d-pad with OK, and a transport row for streaming
playback. Everything else lives behind one big voice button in the
middle. Press, hold, speak: "switch to the soundbar," "find that
show with the lighthouse," "play the next episode."

Pairs with TVs, soundbars, streaming boxes, and satellite receivers
over IR and BLE. A small OLED status display keeps source and volume
visible without lighting up the TV. Two AA batteries last about 18
months under normal use.

For people who count five remotes on their coffee table and want
to count one.

## Listing fields

| Field | Value |
| --- | --- |
| SKU | LAUR-G1-001 |
| Pricing tier | {{tier}} |
| Headline price | {{retailPrice}} |
| Shipping | {{leadDays}}, free over $40 |
| Warranty | {{warrantyMonths}}, parts and labor |
| Category | Home Audio & Video > Universal Remotes |
| Marketplace | {{providerLabel}} |

## Storefront images required

1. **Hero shot** — front-on, voice button lit, on a clean light grey
   background. 2400 × 2400 px minimum.
2. **In-hand** — held in a relaxed grip, thumb on the voice button,
   TV blurred in background.
3. **Detail: transport row** — close-up of the bottom-third controls.
4. **Detail: top edge** — IR transmitter strip + mic port visible.
5. **Lifestyle** — on a coffee table next to a streaming box; the
   "one remote replaces five" beat.
6. **Tech-spec card** — clean infographic with dimensions, battery
   life, supported protocols.

## SEO keywords

universal remote, voice remote, simple remote, streaming remote,
TV remote, soundbar remote, IR remote, BLE remote, accessibility
remote, fewer buttons, voice control, less annoying

## Returns + support

- 30-day no-questions return window.
- Email support, 1-business-day SLA.
- Replacement-part shop for batteries (2× AA cells), spare voice-
  button caps, and the IR LED window if scratched.

## Marketplace fees

| Fee | Rate |
| --- | --- |
| Listing fee | $0 |
| Marketplace commission | 8% of sale |
| Payment processing | 2.9% + $0.30 per transaction |
| Storefront hosting | nominal $200 setup, included |
`;
