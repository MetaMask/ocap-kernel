/**
 * Master SVG for the pcb-layout top-view artifact. Token markers
 * (`{{...}}`) are filled in by `template.ts` on each generate() call.
 *
 * Layout matches the LAUR rev-2 industrial-design + mechanical-design:
 *   - Curved hand-shaped board outline (no more rectangular slab).
 *   - IR LED at the top edge (rev 1 had it on the bottom face).
 *   - D-pad on the right at the rocker level — five switches in a
 *     cross around the OK button (SW6 up / SW7 down / SW8 left /
 *     SW9 right / SW10 OK), replacing the rev-1 channel rocker.
 *   - Transport row labelled back-6s / play-pause / fwd-30s.
 *
 * Token catalog:
 *   {{revLabel}}        rev label
 *   {{providerLabel}}   provider identifier
 *   {{boardColor}}      PCB silkscreen + soldermask base color hex
 *   {{boardSize}}       board dimensions like "58 × 178 mm"
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
    <path class="pcb-fill"
          d="M 95 0
             C 50 4, 18 44, 8 124
             C 0 210, -2 308, 6 412
             C 14 514, 28 626, 50 690
             C 64 738, 92 758, 118 762
             L 222 762
             C 248 758, 276 738, 290 690
             C 312 626, 326 514, 334 412
             C 342 308, 340 210, 332 124
             C 322 44, 290 4, 245 0
             L 95 0 Z" />
    <path class="outline"
          d="M 96 2
             C 52 6, 20 46, 10 126
             C 2 212, 0 308, 8 412
             C 16 514, 30 626, 52 688
             C 66 736, 92 756, 118 760
             L 222 760
             C 248 756, 274 736, 288 688
             C 310 626, 324 514, 332 412
             C 340 308, 338 212, 330 126
             C 320 46, 288 6, 244 2
             L 96 2 Z" />

    <text x="170" y="52" text-anchor="middle" class="title">LAUR · MAIN · {{revLabel}}</text>
    <text x="170" y="68" text-anchor="middle" class="silk" font-size="9">© LAUR Co · {{providerLabel}}</text>

    <g transform="translate(140 18)">
      <rect class="copper-fill" width="20" height="8" />
      <text x="10" y="-2" text-anchor="middle" class="silk" font-size="6">D1 IR LED</text>
    </g>
    <g transform="translate(195 18)">
      <circle class="drill" cx="6" cy="4" r="2.5" />
      <text x="14" y="2" class="silk" font-size="6">mic port</text>
      <rect class="ic-pkg" x="-2" y="10" width="16" height="10" />
      <text x="6" y="17" text-anchor="middle" class="silk" font-size="6">U3</text>
    </g>

    <g transform="translate(70 108)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW2 PWR</text>
    </g>

    <g transform="translate(248 108)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW5 MUTE</text>
    </g>

    <g transform="translate(135 162)">
      <rect class="conn" width="70" height="14" />
      <g class="copper-fill">
        <rect x="4"  y="-2" width="3" height="3" />
        <rect x="22" y="-2" width="3" height="3" />
        <rect x="40" y="-2" width="3" height="3" />
        <rect x="58" y="-2" width="3" height="3" />
      </g>
      <text x="35" y="10" text-anchor="middle" class="silk" font-size="7">J1 OLED</text>
    </g>

    <g transform="translate(120 220)">
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

    <g transform="translate(120 372)">
      <circle class="btn-pkg" cx="50" cy="50" r="44" />
      <circle class="btn-marker" cx="50" cy="50" r="28" />
      <rect class="pad-rect" x="20" y="-3" width="6" height="3" />
      <rect class="pad-rect" x="74" y="-3" width="6" height="3" />
      <rect class="pad-rect" x="20" y="100" width="6" height="3" />
      <rect class="pad-rect" x="74" y="100" width="6" height="3" />
      <text x="50" y="112" text-anchor="middle" class="silk" font-size="8">SW1 · VOICE</text>
    </g>

    <g transform="translate(34 440)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW3 V+</text>
    </g>

    <g transform="translate(34 552)">
      <rect class="btn-pkg" width="22" height="22" rx="3" />
      <circle class="btn-marker" cx="11" cy="11" r="6" />
      <rect class="pad-rect" x="-3" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="6" height="3" />
      <rect class="pad-rect" x="19" y="4"  width="6" height="3" />
      <rect class="pad-rect" x="19" y="15" width="6" height="3" />
      <text x="11" y="34" text-anchor="middle" class="silk" font-size="6">SW4 V-</text>
    </g>

    <g transform="translate(270 510)">
      <rect class="btn-pkg" x="-7" y="-26" width="14" height="14" rx="2" />
      <circle class="btn-marker" cx="0" cy="-19" r="4" />
      <text x="0" y="-30" text-anchor="middle" class="silk" font-size="6">SW6 UP</text>

      <rect class="btn-pkg" x="-7" y="12" width="14" height="14" rx="2" />
      <circle class="btn-marker" cx="0" cy="19" r="4" />
      <text x="0" y="38" text-anchor="middle" class="silk" font-size="6">SW7 DN</text>

      <rect class="btn-pkg" x="-26" y="-7" width="14" height="14" rx="2" />
      <circle class="btn-marker" cx="-19" cy="0" r="4" />
      <text x="-32" y="2" text-anchor="end" class="silk" font-size="6">SW8 L</text>

      <rect class="btn-pkg" x="12" y="-7" width="14" height="14" rx="2" />
      <circle class="btn-marker" cx="19" cy="0" r="4" />
      <text x="32" y="2" class="silk" font-size="6">SW9 R</text>

      <circle class="btn-pkg" cx="0" cy="0" r="6" />
      <circle class="btn-marker" cx="0" cy="0" r="3" />
      <text x="0" y="2" text-anchor="middle" class="silk" font-size="5">OK</text>
      <text x="0" y="-46" text-anchor="middle" class="silk" font-size="7">SW10 D-PAD</text>
    </g>

    <g transform="translate(60 600)">
      <rect class="btn-pkg" width="32" height="32" rx="3" />
      <circle class="btn-marker" cx="16" cy="16" r="9" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="29" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="29" y="23" width="6" height="3" />
      <text x="16" y="44" text-anchor="middle" class="silk" font-size="6">SW11 BACK 6s</text>
    </g>
    <g transform="translate(140 600)">
      <rect class="btn-pkg" width="60" height="32" rx="14" />
      <circle class="btn-marker" cx="20" cy="16" r="6" />
      <circle class="btn-marker" cx="40" cy="16" r="6" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="57" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="57" y="23" width="6" height="3" />
      <text x="30" y="44" text-anchor="middle" class="silk" font-size="6">SW12 PLAY/PAUSE</text>
    </g>
    <g transform="translate(248 600)">
      <rect class="btn-pkg" width="32" height="32" rx="3" />
      <circle class="btn-marker" cx="16" cy="16" r="9" />
      <rect class="pad-rect" x="-3" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="-3" y="23" width="6" height="3" />
      <rect class="pad-rect" x="29" y="6"  width="6" height="3" />
      <rect class="pad-rect" x="29" y="23" width="6" height="3" />
      <text x="16" y="44" text-anchor="middle" class="silk" font-size="6">SW13 FWD 30s</text>
    </g>

    <g transform="translate(60 660)">
      <text x="60" y="-2" text-anchor="middle" class="silk" font-size="7">IR driver (to top-edge LED)</text>
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
    </g>

    <g transform="translate(90 700)">
      <rect class="copper-fill" width="20" height="30" />
      <text x="10" y="46" text-anchor="middle" class="silk" font-size="7">BT1+</text>
    </g>
    <g transform="translate(140 706)">
      <rect class="ic-pkg" width="60" height="20" />
      <rect class="pad-rect" x="-3" y="3"  width="4" height="3" />
      <rect class="pad-rect" x="-3" y="9"  width="4" height="3" />
      <rect class="pad-rect" x="-3" y="15" width="4" height="3" />
      <rect class="pad-rect" x="59" y="6"  width="4" height="3" />
      <rect class="pad-rect" x="59" y="12" width="4" height="3" />
      <text x="30" y="14" text-anchor="middle" class="silk" font-size="7">U2 LDO</text>
    </g>
    <g transform="translate(230 700)">
      <rect class="copper-fill" width="20" height="30" />
      <text x="10" y="46" text-anchor="middle" class="silk" font-size="7">BT1-</text>
    </g>

    <circle class="drill" cx="34"  cy="80"  r="5" />
    <circle class="drill" cx="306" cy="80"  r="5" />
    <circle class="drill" cx="40"  cy="740" r="5" />
    <circle class="drill" cx="300" cy="740" r="5" />

    <g class="copper" stroke-width="1.6">
      <path d="M 150 24 L 150 60 L 130 60 L 130 168" />
      <path d="M 220 240 L 244 240 L 244 90 L 270 90 L 270 118" stroke-width="1.2" />
      <path d="M 130 232 L 100 232 L 100 138 L 92 138" stroke-width="1.2" />
      <path d="M 130 250 L 80 250 L 80 440" stroke-width="1.2" />
      <path d="M 130 268 L 70 268 L 70 552" stroke-width="1.2" />
      <path d="M 220 260 L 244 260 L 244 484 L 270 484" stroke-width="1.2" />
      <path d="M 220 280 L 254 280 L 254 536 L 289 536" stroke-width="1.2" />
      <path d="M 220 300 L 250 300 L 250 503 L 263 503" stroke-width="1.2" />
      <path d="M 130 314 L 110 314 L 110 510" stroke-width="1.2" />
      <path d="M 60 660 L 60 690 L 90 700" />
      <path d="M 140 670 L 140 706" />
      <path d="M 220 660 L 240 660 L 240 690 L 230 700" />
    </g>
  </g>

  <text x="20" y="32" class="annot" font-weight="bold">LAUR PCB · top view</text>
  <text x="20" y="48" class="annot" fill="#666" font-size="10">{{providerLabel}} · rev {{revLabel}} · {{boardSize}} · 2-layer · ENIG finish</text>

  <text x="490" y="64"  class="annot" font-size="10" font-weight="bold">Notes</text>
  <text x="490" y="80"  class="annot" font-size="9">Min trace/space: 6/6 mil</text>
  <text x="490" y="94"  class="annot" font-size="9">Auto-routed</text>
  <text x="490" y="108" class="annot" font-size="9">No impedance control</text>
  <text x="490" y="128" class="annot" font-size="10" font-weight="bold">Switches</text>
  <text x="490" y="144" class="annot" font-size="9">SW1 voice (centre)</text>
  <text x="490" y="158" class="annot" font-size="9">SW2 power · SW5 mute</text>
  <text x="490" y="172" class="annot" font-size="9">SW3/4 vol +/-</text>
  <text x="490" y="186" class="annot" font-size="9">SW6-10 d-pad + OK</text>
  <text x="490" y="200" class="annot" font-size="9">SW11/12/13 transport</text>
</svg>`;
