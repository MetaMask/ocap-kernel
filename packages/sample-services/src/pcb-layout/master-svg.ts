/**
 * Master SVG for the pcb-layout top-view artifact. Token markers
 * (`{{...}}`) are filled in by `template.ts` on each generate() call.
 *
 * Token catalog:
 *   {{revLabel}}        rev label
 *   {{providerLabel}}   provider identifier
 *   {{boardColor}}      PCB silkscreen + soldermask base color hex
 *   {{boardSize}}       board dimensions like "46 × 108 mm"
 */
export const MASTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 880" font-family="Arial, sans-serif" font-size="8">
  <defs>
    <style>
      .pcb-fill   { fill: {{boardColor}}; }
      .silk       { fill: #ffffff; stroke: none; font-family: 'Arial Narrow', sans-serif; font-size: 8; }
      .copper     { stroke: #b85c1a; stroke-linecap: round; fill: none; }
      .copper-fill{ fill: #b85c1a; }
      .pad        { fill: #d9d9d9; stroke: #999; stroke-width: 0.3; }
      .pad-rect   { fill: #d9d9d9; stroke: none; }
      .drill      { fill: #ffffff; stroke: #999; stroke-width: 0.5; }
      .ic-pkg     { fill: #2a2a2a; }
      .ic-pin1    { fill: #d9d9d9; }
      .btn-pkg    { fill: #d9d9d9; stroke: #888; stroke-width: 0.4; }
      .btn-marker { fill: none; stroke: #555; stroke-width: 0.4; }
      .conn       { fill: #c4c4c4; stroke: #555; stroke-width: 0.4; }
      .outline    { fill: none; stroke: #fff; stroke-width: 1.2; stroke-dasharray: 4 2; }
      .title      { fill: #ffffff; font-family: 'Arial', sans-serif; font-size: 14; font-weight: bold; }
      .annot      { fill: #1c1c1c; font-family: 'Courier New', monospace; font-size: 11; }
    </style>
  </defs>

  <rect width="600" height="880" fill="#fafafa" />

  <g transform="translate(130 40)">
    <rect class="pcb-fill" x="0" y="0" width="340" height="800" rx="40" />
    <rect class="outline" x="2" y="2" width="336" height="796" rx="38" />

    <text x="170" y="44" text-anchor="middle" class="title">LAUR · MAIN · {{revLabel}}</text>
    <text x="170" y="60" text-anchor="middle" class="silk" font-size="9">© LAUR Co · {{providerLabel}}</text>

    <g transform="translate(160 80)">
      <rect class="ic-pkg" width="22" height="16" />
      <text x="11" y="11" text-anchor="middle" class="silk" font-size="6">U3</text>
      <circle class="drill" cx="11" cy="-12" r="2.5" />
      <text x="22" y="-10" class="silk" font-size="6">mic port</text>
      <rect class="pad-rect" x="-3"  y="3"  width="4" height="3" />
      <rect class="pad-rect" x="-3"  y="9"  width="4" height="3" />
      <rect class="pad-rect" x="21"  y="3"  width="4" height="3" />
      <rect class="pad-rect" x="21"  y="9"  width="4" height="3" />
    </g>

    <g transform="translate(135 124)">
      <rect class="conn" width="70" height="14" />
      <g class="copper-fill">
        <rect x="4"  y="-2" width="3" height="3" />
        <rect x="22" y="-2" width="3" height="3" />
        <rect x="40" y="-2" width="3" height="3" />
        <rect x="58" y="-2" width="3" height="3" />
      </g>
      <text x="35" y="10" text-anchor="middle" class="silk" font-size="7">J1 OLED</text>
    </g>

    <g transform="translate(34 168)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW2 PWR</text>
    </g>

    <g transform="translate(284 168)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW5 MUTE</text>
    </g>

    <g transform="translate(120 216)">
      <rect class="ic-pkg" width="100" height="100" />
      <circle class="ic-pin1" cx="8" cy="8" r="2.5" />
      <g class="pad-rect">
        <rect x="6"   y="-6" width="3" height="6" /><rect x="14"  y="-6" width="3" height="6" />
        <rect x="22"  y="-6" width="3" height="6" /><rect x="30"  y="-6" width="3" height="6" />
        <rect x="38"  y="-6" width="3" height="6" /><rect x="46"  y="-6" width="3" height="6" />
        <rect x="54"  y="-6" width="3" height="6" /><rect x="62"  y="-6" width="3" height="6" />
        <rect x="70"  y="-6" width="3" height="6" /><rect x="78"  y="-6" width="3" height="6" />
        <rect x="86"  y="-6" width="3" height="6" />
        <rect x="6"   y="100" width="3" height="6" /><rect x="14"  y="100" width="3" height="6" />
        <rect x="22"  y="100" width="3" height="6" /><rect x="30"  y="100" width="3" height="6" />
        <rect x="38"  y="100" width="3" height="6" /><rect x="46"  y="100" width="3" height="6" />
        <rect x="54"  y="100" width="3" height="6" /><rect x="62"  y="100" width="3" height="6" />
        <rect x="70"  y="100" width="3" height="6" /><rect x="78"  y="100" width="3" height="6" />
        <rect x="86"  y="100" width="3" height="6" />
        <rect x="-6" y="6"  width="6" height="3" /><rect x="-6" y="14" width="6" height="3" />
        <rect x="-6" y="22" width="6" height="3" /><rect x="-6" y="30" width="6" height="3" />
        <rect x="-6" y="38" width="6" height="3" /><rect x="-6" y="46" width="6" height="3" />
        <rect x="-6" y="54" width="6" height="3" /><rect x="-6" y="62" width="6" height="3" />
        <rect x="-6" y="70" width="6" height="3" /><rect x="-6" y="78" width="6" height="3" />
        <rect x="-6" y="86" width="6" height="3" />
        <rect x="100" y="6"  width="6" height="3" /><rect x="100" y="14" width="6" height="3" />
        <rect x="100" y="22" width="6" height="3" /><rect x="100" y="30" width="6" height="3" />
        <rect x="100" y="38" width="6" height="3" /><rect x="100" y="46" width="6" height="3" />
        <rect x="100" y="54" width="6" height="3" /><rect x="100" y="62" width="6" height="3" />
        <rect x="100" y="70" width="6" height="3" /><rect x="100" y="78" width="6" height="3" />
        <rect x="100" y="86" width="6" height="3" />
      </g>
      <text x="50" y="58" text-anchor="middle" class="silk" font-size="9">U1</text>
    </g>

    <g transform="translate(34 360)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW3 V+</text>
    </g>

    <g transform="translate(34 412)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW4 V-</text>
    </g>

    <g transform="translate(284 360)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW6 CH+</text>
    </g>

    <g transform="translate(284 412)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW7 CH-</text>
    </g>

    <g transform="translate(120 360)">
      <circle class="btn-pkg" cx="50" cy="50" r="44" />
      <circle class="btn-marker" cx="50" cy="50" r="28" />
      <rect class="pad-rect" x="20" y="-3" width="6" height="3" />
      <rect class="pad-rect" x="74" y="-3" width="6" height="3" />
      <rect class="pad-rect" x="20" y="100" width="6" height="3" />
      <rect class="pad-rect" x="74" y="100" width="6" height="3" />
      <text x="50" y="112" text-anchor="middle" class="silk" font-size="8">SW1 · VOICE</text>
    </g>

    <g transform="translate(60 504)">
      <rect class="btn-pkg" width="32" height="32" rx="3" />
      <circle class="btn-marker" cx="16" cy="16" r="9" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="29" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="29" y="23" width="6" height="3" />
      <text x="16" y="44" text-anchor="middle" class="silk" font-size="6">SW8 BACK</text>
    </g>
    <g transform="translate(140 504)">
      <rect class="btn-pkg" width="60" height="32" rx="14" />
      <circle class="btn-marker" cx="20" cy="16" r="6" />
      <circle class="btn-marker" cx="40" cy="16" r="6" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="57" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="57" y="23" width="6" height="3" />
      <text x="30" y="44" text-anchor="middle" class="silk" font-size="6">SW9 PLAY/PAUSE</text>
    </g>
    <g transform="translate(248 504)">
      <rect class="btn-pkg" width="32" height="32" rx="3" />
      <circle class="btn-marker" cx="16" cy="16" r="9" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="29" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="29" y="23" width="6" height="3" />
      <text x="16" y="44" text-anchor="middle" class="silk" font-size="6">SW10 FFWD</text>
    </g>

    <g transform="translate(40 568)">
      <text x="60" y="-2" text-anchor="middle" class="silk" font-size="7">IR driver</text>
      <rect class="ic-pkg" width="20" height="14" />
      <rect class="pad-rect" x="-2" y="2"  width="4" height="3" />
      <rect class="pad-rect" x="-2" y="9"  width="4" height="3" />
      <rect class="pad-rect" x="18" y="5.5" width="4" height="3" />
      <text x="10" y="9"  text-anchor="middle" class="silk" font-size="6">Q1</text>
      <rect class="pad-rect" x="34"  y="2" width="3" height="6" />
      <rect class="pad-rect" x="43"  y="2" width="3" height="6" />
      <rect class="ic-pkg" x="37" y="2" width="6" height="6" />
      <text x="40" y="20" text-anchor="middle" class="silk" font-size="6">R1</text>
      <rect class="pad-rect" x="58"  y="2" width="3" height="6" />
      <rect class="pad-rect" x="67"  y="2" width="3" height="6" />
      <rect class="ic-pkg" x="61" y="2" width="6" height="6" />
      <text x="64" y="20" text-anchor="middle" class="silk" font-size="6">R2</text>
      <rect class="pad-rect" x="82"  y="0" width="4" height="8" />
      <rect class="pad-rect" x="92"  y="0" width="4" height="8" />
      <rect class="copper-fill" x="86" y="0" width="6" height="8" />
      <text x="89" y="20" text-anchor="middle" class="silk" font-size="6">D1 IR</text>
    </g>

    <g transform="translate(30 640)">
      <rect class="copper-fill" width="20" height="50" />
      <text x="10" y="64" text-anchor="middle" class="silk" font-size="7">BT1+</text>
    </g>
    <g transform="translate(140 660)">
      <rect class="ic-pkg" width="60" height="20" />
      <rect class="pad-rect" x="-3" y="3"  width="4" height="3" />
      <rect class="pad-rect" x="-3" y="9"  width="4" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="4" height="3" />
      <rect class="pad-rect" x="59" y="6"  width="4" height="3" />
      <rect class="pad-rect" x="59" y="12" width="4" height="3" />
      <text x="30" y="14" text-anchor="middle" class="silk" font-size="7">U2 LDO</text>
    </g>
    <g transform="translate(290 640)">
      <rect class="copper-fill" width="20" height="50" />
      <text x="10" y="64" text-anchor="middle" class="silk" font-size="7">BT1-</text>
    </g>

    <g transform="translate(110 720)">
      <rect class="conn" width="120" height="32" />
      <g class="copper-fill">
        <rect x="6"   y="34" width="3" height="6" /><rect x="14" y="34" width="3" height="6" />
        <rect x="22"  y="34" width="3" height="6" /><rect x="30" y="34" width="3" height="6" />
        <rect x="38"  y="34" width="3" height="6" /><rect x="46" y="34" width="3" height="6" />
        <rect x="54"  y="34" width="3" height="6" /><rect x="62" y="34" width="3" height="6" />
        <rect x="70"  y="34" width="3" height="6" /><rect x="78" y="34" width="3" height="6" />
        <rect x="86"  y="34" width="3" height="6" /><rect x="94" y="34" width="3" height="6" />
        <rect x="102" y="34" width="3" height="6" /><rect x="110" y="34" width="3" height="6" />
      </g>
      <text x="60" y="22" text-anchor="middle" class="silk" font-size="8">J2 USB-C</text>
    </g>

    <circle class="drill" cx="20"  cy="20"  r="6" />
    <circle class="drill" cx="320" cy="20"  r="6" />
    <circle class="drill" cx="20"  cy="780" r="6" />
    <circle class="drill" cx="320" cy="780" r="6" />

    <g class="copper" stroke-width="1.6">
      <path d="M 240 100 L 280 100 L 280 660" />
      <path d="M 60 100 L 60 660" />
      <path d="M 60 720 L 110 720" />
      <path d="M 130 316 L 110 316 L 110 568 L 70 568" stroke-width="1.2" />
      <path d="M 220 226 L 240 226 L 240 90 L 192 90" stroke-width="1.2" />
      <path d="M 220 240 L 244 240 L 244 86 L 192 86" stroke-width="1.2" />
      <path d="M 130 230 L 100 230 L 100 134" stroke-width="1.2" />
      <path d="M 130 246 L 90 246 L 90 138" stroke-width="1.2" />
      <path d="M 220 290 L 240 290 L 240 384 L 192 384" stroke-width="1.2" />
    </g>
  </g>

  <text x="20" y="32" class="annot" font-weight="bold">LAUR PCB · top view</text>
  <text x="20" y="48" class="annot" fill="#666" font-size="10">{{providerLabel}} · rev {{revLabel}} · {{boardSize}} · 2-layer · ENIG finish</text>

  <text x="490" y="64"  class="annot" font-size="10" font-weight="bold">Notes</text>
  <text x="490" y="80"  class="annot" font-size="9">Min trace/space: 6/6 mil</text>
  <text x="490" y="94"  class="annot" font-size="9">Auto-routed</text>
  <text x="490" y="108" class="annot" font-size="9">No impedance control</text>
</svg>`;
