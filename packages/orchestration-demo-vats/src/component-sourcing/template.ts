/**
 * BOM rendering for the component-sourcing service. Renders a
 * quantity-aware bill of materials by computing per-line and total
 * prices from the volume-tier profile derived from the agent's
 * brief.
 */

import {
  formatUsd,
  makeVolumeProfile,
  parseQuantity,
} from '../vat-lib/volume-pricing.ts';
import type { VolumeTierProfile } from '../vat-lib/volume-pricing.ts';

/**
 * MCU is locked to ESP32-S3-MINI-N8 so the schematic, firmware,
 * component-sourcing, and pcb-layout dummy services all agree (see
 * the matching note in schematic-generation/template.ts).
 */
const MCU_PART = 'ESP32-S3-MINI-N8';
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for record of alternative MCUs
const ALTERNATE_MCU_PARTS = ['nRF52833-QIAA', 'nRF52840-QIAA'] as const;

/**
 * Electronic component line items at prototype-tier per-unit cost.
 * Each unit cost is scaled by `profile.componentMultiplier` at
 * render time. The enclosure and the PCB sit alongside this list
 * but are derived from the profile so the modality switch
 * (SLA→injection-molded) shows up correctly in the modality cell.
 */
type LineItem = {
  ref: string;
  desc: string;
  partNumber: string;
  distributor: string;
  leadTime: string;
  baseUnitUsd: number;
};

const ELECTRONIC_LINE_ITEMS: readonly LineItem[] = [
  {
    ref: 'U1',
    desc: 'MCU, BLE 5 SoC',
    partNumber: MCU_PART,
    distributor: 'Mouser',
    leadTime: '14 days',
    baseUnitUsd: 4.85,
  },
  {
    ref: 'U2',
    desc: 'MEMS microphone, far-field',
    partNumber: 'SPH0645LM4H-B',
    distributor: 'Digi-Key',
    leadTime: '7 days',
    baseUnitUsd: 1.95,
  },
  {
    ref: 'U3',
    desc: 'LDO, 3.0 V, 500 mA',
    partNumber: 'MIC5219-3.0YM5',
    distributor: 'Mouser',
    leadTime: '7 days',
    baseUnitUsd: 0.42,
  },
  {
    ref: 'U4',
    desc: 'IR LED driver transistor',
    partNumber: 'MMBT2222ALT1G',
    distributor: 'Mouser',
    leadTime: '7 days',
    baseUnitUsd: 0.08,
  },
  {
    ref: 'U5',
    desc: 'OLED display module, 1.5 in mono I2C',
    partNumber: 'SSD1306-1.5',
    distributor: 'LCSC',
    leadTime: '14 days',
    baseUnitUsd: 3.1,
  },
  {
    ref: 'D1',
    desc: 'IR transmitter LED, 940 nm',
    partNumber: 'TSAL6400',
    distributor: 'Mouser',
    leadTime: '7 days',
    baseUnitUsd: 0.32,
  },
  {
    ref: 'D2',
    desc: 'Schottky diode, reverse-polarity protect',
    partNumber: 'BAT54',
    distributor: 'Digi-Key',
    leadTime: '7 days',
    baseUnitUsd: 0.06,
  },
  {
    ref: 'Y1',
    desc: '32 kHz crystal, low-power',
    partNumber: 'ABS06-32.768KHZ-T',
    distributor: 'Digi-Key',
    leadTime: '7 days',
    baseUnitUsd: 0.34,
  },
  {
    ref: 'L1',
    desc: 'Inductor, 10 uH',
    partNumber: 'LQM21PN100MGCD',
    distributor: 'Mouser',
    leadTime: '7 days',
    baseUnitUsd: 0.08,
  },
  {
    ref: 'C1-C10',
    desc: 'MLCC, mixed values 0402/0603',
    partNumber: '(Yageo assorted)',
    distributor: 'LCSC',
    leadTime: '7 days',
    baseUnitUsd: 0.12,
  },
  {
    ref: 'R1-R12',
    desc: 'Resistors, mixed values 0402',
    partNumber: '(Yageo assorted)',
    distributor: 'LCSC',
    leadTime: '7 days',
    baseUnitUsd: 0.096,
  },
  {
    ref: 'SW1-10',
    desc: 'Tact switches, side-actuated',
    partNumber: 'TL3303AF160QG',
    distributor: 'Mouser',
    leadTime: '7 days',
    baseUnitUsd: 1.8,
  },
  {
    ref: 'BAT',
    desc: '2× AA battery holder, PCB-mount',
    partNumber: 'BC-22AAPC',
    distributor: 'Digi-Key',
    leadTime: '7 days',
    baseUnitUsd: 0.78,
  },
  {
    ref: 'MISC',
    desc: 'Screws, gaskets, mic gasket foam',
    partNumber: '(assorted)',
    distributor: 'McMaster',
    leadTime: '7 days',
    baseUnitUsd: 1.2,
  },
];

export type TemplateInputs = {
  providerLabel: string;
  /** The agent's free-text brief — parsed for a quantity. */
  brief: string;
  /** Default quantity if the brief doesn't mention one. */
  defaultQuantity: number;
};

export type RenderResult = {
  markdown: string;
  profile: VolumeTierProfile;
  perUnitUsd: number;
  batchTotalUsd: number;
};

/**
 * Tier-specific sourcing notes appended to the BOM markdown.
 *
 * @param profile - The volume-tier profile in effect.
 * @returns A multi-line markdown bullet list.
 */
function buildSourcingNotes(profile: VolumeTierProfile): string {
  if (profile.tier === 'prototype') {
    return (
      `- Prototype-batch pricing shown above. Bulk discount available at 1 ku+ per part.\n` +
      `- Substitutes pre-qualified for the MLCC and resistor lines (Murata GRM, KOA RK series) — drop-in at the same cost band.\n` +
      `- Recommend a 10% per-line overage on the passives to absorb pick-and-place attrition.\n` +
      `- IR LED stock is sensitive to seasonal demand; lock allocation before placing the order if the batch slips by more than two weeks.`
    );
  }
  if (profile.enclosureModality === 'SLA') {
    return (
      `- Volume-tier pricing applied at ${profile.tierLabel}.\n` +
      `- Enclosure still SLA-printed at this volume — injection molding becomes economical at 500+ units; consider it for the next tier up.\n` +
      `- Passive overage of 5% included in the unit cost; pick-and-place attrition lower at SMT-line volumes.\n` +
      `- Component lead times shown reflect the worst-case at this volume; most lines are shelf stock at the cited distributors.`
    );
  }
  return (
    `- Volume-tier pricing applied at ${profile.tierLabel}.\n` +
    `- Enclosure switched to injection molding; the unit price above includes amortized tooling cost.\n` +
    `- ESP32-S3 and the OLED module are sourced direct from the manufacturer rep at this volume — lead time gated on injection-mold tooling rather than parts.\n` +
    `- Recommend a single locked allocation across the run; mid-batch price changes are rare at this tier but supplier vetting should be done up front.`
  );
}

/**
 * Render the quantity-aware BOM markdown.
 *
 * @param inputs - Caller-supplied inputs.
 * @returns The rendered markdown plus the underlying pricing
 *   numbers so the calling service can echo the same values in its
 *   summary and (later) the purchase receipt.
 */
export function renderBom(inputs: TemplateInputs): RenderResult {
  const quantity = parseQuantity(inputs.brief, inputs.defaultQuantity);
  const profile = makeVolumeProfile(quantity);
  const enclosureLeadTime =
    profile.enclosureModality === 'SLA' ? '10 days' : '21 days';
  const pcbLeadTime = '14 days';

  // Compute per-line unit prices at this tier, then sum.
  const scaledLines = ELECTRONIC_LINE_ITEMS.map((item) => {
    const unit = item.baseUnitUsd * profile.componentMultiplier;
    return {
      ...item,
      unitUsd: unit,
      extUsd: unit * quantity,
    };
  });
  const electronicsPerUnit = scaledLines.reduce(
    (sum, item) => sum + item.unitUsd,
    0,
  );
  const perUnitUsd =
    electronicsPerUnit + profile.pcbUnitUsd + profile.enclosureUnitUsd;
  const batchTotalUsd = perUnitUsd * quantity;

  const enclosureLine = {
    ref: 'ENC',
    desc:
      profile.enclosureModality === 'SLA'
        ? 'SLA-printed enclosure, charcoal matte'
        : 'Injection-molded enclosure, charcoal ABS (tooling amortized)',
    partNumber:
      profile.enclosureModality === 'SLA'
        ? '(custom, see STL)'
        : '(custom, see CAD)',
    distributor:
      profile.enclosureModality === 'SLA' ? 'Protolabs' : 'Shenzhen mold shop',
    leadTime: enclosureLeadTime,
    unitUsd: profile.enclosureUnitUsd,
    extUsd: profile.enclosureUnitUsd * quantity,
  };
  const pcbLine = {
    ref: 'PCB',
    desc: '4-layer PCB, 58 × 182 mm',
    partNumber: '(custom, see gerbers)',
    distributor: 'JLCPCB',
    leadTime: pcbLeadTime,
    unitUsd: profile.pcbUnitUsd,
    extUsd: profile.pcbUnitUsd * quantity,
  };

  const bomLines = [...scaledLines, pcbLine, enclosureLine];
  const tableRows = bomLines
    .map(
      (item) =>
        `| ${item.ref} | ${item.desc} | ${item.partNumber} | ${
          item.distributor
        } | ${item.leadTime} | ${formatUsd(item.unitUsd)} | ${formatUsd(
          item.extUsd,
        )} |`,
    )
    .join('\n');

  const sourcingNotes = buildSourcingNotes(profile);

  return {
    profile,
    perUnitUsd,
    batchTotalUsd,
    markdown:
      `# Bill of materials — LAUR (${profile.tierLabel})\n\n` +
      `| Ref | Description | Part number | Distributor | Lead time | Unit price | Ext. price |\n` +
      `| --- | --- | --- | --- | --- | --- | --- |\n` +
      `${tableRows}\n\n` +
      `## Totals\n\n` +
      `- **Per-unit cost (BOM only):** ${formatUsd(perUnitUsd)}\n` +
      `- **Batch total (${quantity.toLocaleString()} units):** ${formatUsd(
        batchTotalUsd,
      )}\n\n` +
      `## Lead time\n\n` +
      `Worst-case lead time across all line items: gated by the MCU ` +
      `(${
        ELECTRONIC_LINE_ITEMS[0]?.leadTime ?? '14 days'
      }) and the enclosure (${enclosureLeadTime}, ${
        profile.enclosureModality === 'SLA'
          ? 'SLA-printed'
          : 'injection-molded with tooling lead'
      }).\n\n` +
      `## Sourcing notes — ${inputs.providerLabel}\n\n` +
      `${sourcingNotes}\n`,
  };
}
