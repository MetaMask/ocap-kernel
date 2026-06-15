/**
 * Master markdown for the device-assembly service.
 *
 * Token catalog:
 *   {{providerLabel}}    provider identifier
 *   {{batchSize}}        prototype batch size
 *   {{leadDays}}         turnaround for the build, e.g. "3 weeks"
 *   {{unitCost}}         per-unit assembly cost
 *   {{batchTotal}}       full-batch assembly total
 *   {{qaPassRate}}       expected QA pass rate
 */
export const MASTER_MD = `# Build plan — LAUR prototype batch

## Scope

- Batch: **{{batchSize}}**
- Provider: **{{providerLabel}}**
- Turnaround from order to handover: **{{leadDays}}**
- Per-unit assembly cost: **{{unitCost}}** (excludes BOM)
- Batch total (assembly only): **{{batchTotal}}**

## Work cells

| Cell | Task | Tooling | Time per unit |
| --- | --- | --- | --- |
| 1 | SMT placement (PCB top + bottom) | LumiNext II pick-and-place | 90 s |
| 2 | Reflow + AOI | 8-zone convection oven, AOI station | 6 min (oven), 30 s (AOI) |
| 3 | Through-hole (battery contacts, mic) | manual / fixture jig | 2 min |
| 4 | Functional test (power, BLE, IR, mic, OLED) | bench test rig with golden TV emulator | 4 min |
| 5 | Mechanical assembly (enclosure, screws, gaskets) | torque drivers, alignment jig | 3 min |
| 6 | Final QA (visual + button feel + drop check) | inspector station | 2 min |
| 7 | Pack & label | shipper-ready box, label printer | 1 min |

## Test sequence (per unit, post-assembly)

1. **Power on / sleep current** — verifies LDO + battery contacts (<25 µA deep-sleep)
2. **BLE advertisement scan** — confirms radio, antenna tuning
3. **IR self-loopback** — TX into onboard receiver diode, all four protocols
4. **Microphone capture** — 500 ms tone burst, SNR ≥ 35 dB
5. **OLED render test** — boot logo + greyscale ramp, dim/full sweep
6. **Button matrix walk** — every key debounced, no shorts to neighbors
7. **Drop test (sample, 1-in-10)** — 1.2 m onto hardwood, no functional loss

Expected first-pass yield: **{{qaPassRate}}**. Units that fail any step
return to cell 4 for diagnosis; persistent failures pulled from the
batch.

## Acceptance gate

A unit ships to the inventor only after:

- All seven test steps pass.
- Visual inspection notes the matte finish is uniform and the
  voice-button ring is free of mold flash.
- Serial number printed on the rear is legible at arm's length.

## Schedule

- Day 0: kit pull from stock, SMT prep
- Day 2: SMT + reflow + AOI for the full batch
- Day 4: through-hole + first 3 units through cells 4–6 (pilot)
- Day 6: balance of the batch through cells 4–6
- Day 7: final QA + pack
- Day 8–14: courier to inventor

## Risk callouts

- The OLED display module is moisture-sensitive (MSL 3). Bake the
  reel for 8 h at 60 °C if humidity in the SMT room exceeds 50% RH.
- IR LED reflow profile is on the warm side of the panel's
  tolerance — use the gentler ramp from cell 2's saved profile.
- Drop test samples may need replacement units; budget an extra 1 in
  10 above the headline batch size.
`;
