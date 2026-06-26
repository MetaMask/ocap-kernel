/**
 * Build-plan rendering for the device-assembly service. The plan
 * scales its quantities, lead times, and per-unit labor based on
 * the volume tier parsed from the agent's brief.
 */

import {
  formatUsd,
  makeVolumeProfile,
  parseQuantity,
} from '../vat-lib/volume-pricing.ts';
import type { VolumeTierProfile } from '../vat-lib/volume-pricing.ts';

export type TemplateInputs = {
  providerLabel: string;
  brief: string;
  defaultQuantity: number;
};

/**
 * Flavor text describing how the shop runs at this tier.
 *
 * @param tier - The volume tier.
 * @returns A descriptive sentence.
 */
function describeTierShop(tier: VolumeTierProfile['tier']): string {
  switch (tier) {
    case 'production':
      return (
        `Run is sized for a continuous SMT line; tooling and ` +
        `fixturing investments amortize across the volume. Per-unit ` +
        `labor reflects the high-volume contract-manufacturer tier.`
      );
    case 'medium-volume':
      return (
        `Run engages the full SMT line; ramp time amortizes across ` +
        `the volume so per-unit labor drops meaningfully from the ` +
        `small-batch tier.`
      );
    case 'small-batch':
      return (
        `Run uses the dedicated SMT cell with shared fixturing; ` +
        `still bench-stocked, but the cells run continuously ` +
        `enough to bring labor down from prototype levels.`
      );
    case 'prototype':
    default:
      return (
        `Bench-built batch — pick-and-place head set up per-run, ` +
        `manual handoffs between cells. Per-unit labor reflects ` +
        `the prototype-scale setup overhead.`
      );
  }
}

/**
 * Tier-derived turnaround estimate from parts receipt to handover.
 *
 * @param tier - The volume tier.
 * @returns The lead-time string used in the build plan.
 */
function tierLeadTime(tier: VolumeTierProfile['tier']): string {
  switch (tier) {
    case 'production':
      return '10 weeks';
    case 'medium-volume':
      return '6 weeks';
    case 'small-batch':
      return '3 weeks';
    case 'prototype':
    default:
      return '2 weeks';
  }
}

/**
 * Tier-derived first-pass yield target.
 *
 * @param tier - The volume tier.
 * @returns The QA pass-rate label.
 */
function tierYieldTarget(tier: VolumeTierProfile['tier']): string {
  switch (tier) {
    case 'production':
    case 'medium-volume':
      return '97%';
    case 'small-batch':
      return '95%';
    case 'prototype':
    default:
      return '94%';
  }
}

export type RenderResult = {
  markdown: string;
  profile: VolumeTierProfile;
  perUnitLaborUsd: number;
  batchLaborUsd: number;
  leadTime: string;
  qaPassRate: string;
};

/**
 * Render the build-plan markdown for a given quantity. Lead time
 * and QA pass rate are tier-derived so they read as plausible for
 * the requested batch size.
 *
 * @param inputs - Caller inputs.
 * @returns Rendered markdown plus the underlying pricing numbers.
 */
export function renderBuildPlan(inputs: TemplateInputs): RenderResult {
  const quantity = parseQuantity(inputs.brief, inputs.defaultQuantity);
  const profile = makeVolumeProfile(quantity);
  const perUnitLaborUsd = profile.laborUnitUsd;
  const batchLaborUsd = perUnitLaborUsd * quantity;

  const tierBlurb = describeTierShop(profile.tier);
  const leadTime = tierLeadTime(profile.tier);
  const qaPassRate = tierYieldTarget(profile.tier);

  const markdown =
    `# Build plan — LAUR (${profile.tierLabel})\n\n` +
    `## Scope\n\n` +
    `- Batch: **${quantity.toLocaleString()} units**\n` +
    `- Provider: **${inputs.providerLabel}**\n` +
    `- Turnaround from parts receipt to handover: **${leadTime}**\n` +
    `- Per-unit assembly cost: **${formatUsd(
      perUnitLaborUsd,
    )}** (excludes BOM)\n` +
    `- Batch total (assembly only): **${formatUsd(batchLaborUsd)}**\n\n` +
    `${tierBlurb}\n\n` +
    `## Work cells\n\n` +
    `| Cell | Task | Tooling | Time per unit |\n` +
    `| --- | --- | --- | --- |\n` +
    `| 1 | SMT placement (PCB top + bottom) | LumiNext II pick-and-place | 90 s |\n` +
    `| 2 | Reflow + AOI | 8-zone convection oven, AOI station | 6 min (oven), 30 s (AOI) |\n` +
    `| 3 | Through-hole (battery contacts, mic) | manual / fixture jig | 2 min |\n` +
    `| 4 | Functional test (power, BLE, IR, mic, OLED) | bench test rig with golden TV emulator | 4 min |\n` +
    `| 5 | Mechanical assembly (enclosure, screws, gaskets) | torque drivers, alignment jig | 3 min |\n` +
    `| 6 | Final QA (visual + button feel + drop check) | inspector station | 2 min |\n` +
    `| 7 | Pack & label | shipper-ready box, label printer | 1 min |\n\n` +
    `## Test sequence (per unit, post-assembly)\n\n` +
    `1. **Power on / sleep current** — verifies LDO + battery contacts (<25 µA deep-sleep)\n` +
    `2. **BLE advertisement scan** — confirms radio, antenna tuning\n` +
    `3. **IR self-loopback** — TX into onboard receiver diode, all four protocols\n` +
    `4. **Microphone capture** — 500 ms tone burst, SNR ≥ 35 dB\n` +
    `5. **OLED render test** — boot logo + greyscale ramp, dim/full sweep\n` +
    `6. **Button matrix walk** — every key debounced, no shorts to neighbors\n` +
    `7. **Drop test (sample, 1-in-10)** — 1.2 m onto hardwood, no functional loss\n\n` +
    `Expected first-pass yield: **${qaPassRate}**. Units that fail any ` +
    `step return to cell 4 for diagnosis; persistent failures pulled ` +
    `from the batch.\n\n` +
    `## Acceptance gate\n\n` +
    `A unit ships to the inventor only after:\n\n` +
    `- All seven test steps pass.\n` +
    `- Visual inspection notes the matte finish is uniform and the ` +
    `voice-button ring is free of mold flash.\n` +
    `- Serial number printed on the rear is legible at arm's length.\n\n` +
    `## Risk callouts\n\n` +
    `- The OLED display module is moisture-sensitive (MSL 3). Bake the ` +
    `reel for 8 h at 60 °C if humidity in the SMT room exceeds 50% RH.\n` +
    `- IR LED reflow profile is on the warm side of the panel's ` +
    `tolerance — use the gentler ramp from cell 2's saved profile.\n` +
    `- Drop test samples may need replacement units; budget an extra ` +
    `1 in 10 above the headline batch size.\n`;

  return {
    markdown,
    profile,
    perUnitLaborUsd,
    batchLaborUsd,
    leadTime,
    qaPassRate,
  };
}
