/**
 * Master markdown for the component-sourcing service. Token markers
 * (`{{...}}`) are filled in by `template.ts`. Same wire format as
 * the firmware service.
 *
 * Token catalog:
 *   {{providerLabel}}    provider identifier
 *   {{batchSize}}        prototype batch size, e.g. "10 units"
 *   {{leadDays}}         worst-case lead time, e.g. "14 days"
 *   {{unitTotal}}        per-unit BOM total, e.g. "$67.40"
 *   {{batchTotal}}       full-batch BOM total, e.g. "$674.00"
 *   {{mcuPart}}          MCU part number (echoed from earlier schematic)
 */
export const MASTER_MD = `# Bill of materials — LAUR prototype batch

| Ref | Description | Part number | Distributor | Lead time | Unit price | Ext. price |
| --- | --- | --- | --- | --- | --- | --- |
| U1 | MCU, BLE 5 SoC | {{mcuPart}} | Mouser | {{leadDays}} | $4.85 | $48.50 |
| U2 | MEMS microphone, far-field | SPH0645LM4H-B | Digi-Key | 7 days | $1.95 | $19.50 |
| U3 | LDO, 3.0 V, 500 mA | MIC5219-3.0YM5 | Mouser | 7 days | $0.42 | $4.20 |
| U4 | IR LED driver transistor | MMBT2222ALT1G | Mouser | 7 days | $0.08 | $0.80 |
| U5 | OLED display module, 1.5 in mono I2C | SSD1306-1.5 | LCSC | 14 days | $3.10 | $31.00 |
| D1 | IR transmitter LED, 940 nm | TSAL6400 | Mouser | 7 days | $0.32 | $3.20 |
| D2 | Schottky diode, reverse-polarity protect | BAT54 | Digi-Key | 7 days | $0.06 | $0.60 |
| Y1 | 32 kHz crystal, low-power | ABS06-32.768KHZ-T | Digi-Key | 7 days | $0.34 | $3.40 |
| L1 | Inductor, 10 uH | LQM21PN100MGCD | Mouser | 7 days | $0.08 | $0.80 |
| C1-C10 | MLCC, mixed values 0402/0603 | (Yageo assorted) | LCSC | 7 days | $0.012 avg | $1.20 |
| R1-R12 | Resistors, mixed values 0402 | (Yageo assorted) | LCSC | 7 days | $0.008 avg | $0.96 |
| SW1-10 | Tact switches, side-actuated | TL3303AF160QG | Mouser | 7 days | $0.18 | $18.00 |
| BAT | 2× AA battery holder, PCB-mount | BC-22AAPC | Digi-Key | 7 days | $0.78 | $7.80 |
| PCB | 4-layer PCB, 58 × 182 mm | (custom, see gerbers) | JLCPCB | {{leadDays}} | $4.20 | $42.00 |
| ENC | SLA-printed enclosure, charcoal matte | (custom, see STL) | Protolabs | 10 days | $58.00 | $580.00 |
| MISC | Screws, gaskets, mic gasket foam | (assorted) | McMaster | 7 days | $1.20 | $12.00 |

## Totals

- **Per-unit cost (BOM only):** {{unitTotal}}
- **Batch total ({{batchSize}}):** {{batchTotal}}

## Lead time

Worst-case lead time across all line items: **{{leadDays}}**, gated by
the MCU and the SLA enclosure. All other items are shelf stock.

## Sourcing notes — {{providerLabel}}

- Bulk discount available at 1 ku+ per part; prototype-batch pricing
  shown above.
- Substitutes pre-qualified for the MLCC and resistor lines (Murata
  GRM, KOA RK series) — drop-in at the same cost band.
- Recommend a 10% per-line overage on the passives to absorb pick-
  and-place attrition.
- IR LED stock is sensitive to seasonal demand; lock allocation
  before placing the order if the batch slips by more than two
  weeks.
`;
