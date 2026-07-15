/**
 * Master markdown for the bench-build service. Token substitution
 * happens via {{...}} placeholders. The provider hand-solders a
 * small engineering-prototype run (1-2 units) from a PCB layout and
 * the spec'd parts, flashes the firmware, and returns bring-up notes
 * the inventor can use to decide whether the design is ready for a
 * 15-unit Testing-stage run.
 *
 * Token catalog:
 *   {{providerLabel}}      provider identifier
 *   {{unitCount}}           units built ("2 units", "1 unit", etc.)
 *   {{laborCost}}           proto-pros's labor charge ("$200.00")
 *   {{partsCost}}           pass-through parts cost ("$50.00")
 *   {{invoiceTotal}}        labor + parts total ("$250.00")
 *   {{turnaround}}          turnaround window ("3 days", "5 days", etc.)
 *   {{voiceLatencyMs}}      measured voice-button latency
 *   {{irRange}}             measured IR transmit range
 *   {{deepSleepUa}}         measured deep-sleep current
 *   {{boundedRevision}}     suggested firmware revision ("none", "tighten debounce", etc.)
 */
export const MASTER_MD = `# Engineering prototype — LAUR bring-up notes

## Build summary

**Provider:** {{providerLabel}}
**Units built:** {{unitCount}}, hand-soldered onto sample boards
shipped to us by the customer's PCB house, populated with parts we
sourced from distributor shelf stock.
**Turnaround:** {{turnaround}} from PCB receipt.
**Enclosure:** none. The boards are open-frame; the buttons, mic,
and OLED are mounted on the PCB and exposed for probing.

## Invoice

| Line             | Amount         |
| ---------------- | -------------- |
| Build labor      | {{laborCost}}  |
| Parts (pass-through) | {{partsCost}}  |
| **Total**        | **{{invoiceTotal}}** |

Sample boards came from the customer's PCB layout vendor at no
charge to us; they're covered under the layout engagement.

## Bring-up checks (per unit)

- Power rail validates: 3.3 V regulator stable across the discharge
  range of a fresh AA pair.
- USB-C programming connection confirmed; bootloader handshake
  clean.
- Firmware flash succeeds at {{turnaround}} build cycles per attempt;
  no signing-related failures.
- OLED initializes; status display reads the configured time and
  source.
- MEMS mic captures clean audio across the keypress window; SNR
  measured well above the noise floor under bench conditions.
- IR transmitter reproduces NEC, RC-5, RC-6, and Sony SIRC frames
  against a known-good IR receiver bench.
- Button matrix sweep: all ten keys debounce cleanly at the
  configured threshold.

## Measured

- Voice-button latency: {{voiceLatencyMs}} from physical press to
  mic-rail enable.
- IR effective range: {{irRange}} against a benchtop receiver, with
  the LED unobstructed.
- Deep-sleep current: {{deepSleepUa}}, consistent with the spec
  budget.

## Suggested firmware revision before the 15-unit run

{{boundedRevision}}

## Risks worth knowing before committing to Testing-stage production

- Bench builds are forgiving of part-placement tolerances that a
  reflow line will not be. Plan to budget at least one revision pass
  on the PCB layout if the contract assembler flags solder-paste or
  stencil-aperture issues at panelization.
- The OLED in the prototype is a soldered module; the 15-unit run
  will likely use a connector to ease assembly. That's a layout
  delta, not a circuit one.
- Voice latency was measured on the bench; real-world latency will
  depend on the companion app's NLU backend roundtrip — out of scope
  for this build.
`;
