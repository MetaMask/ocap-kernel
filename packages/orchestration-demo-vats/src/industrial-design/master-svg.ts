/**
 * Master SVG for the industrial-design concept sketch. Token markers
 * (`{{...}}`) are filled in by `template.ts` on each generate() call
 * so the on-screen artifact varies subtly between runs.
 *
 * Token catalog:
 *   {{revLabel}}            short rev label, e.g. "A1", "B2"
 *   {{providerLabel}}       provider identifier in the corner
 *   {{screenTime}}          clock string shown on the OLED, e.g. "20:34"
 *   {{batteryLifeMonths}}   battery life label, e.g. "18 mo typical"
 *   {{irProtocols}}         comma-or-plus separated IR protocol list
 */
export const MASTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 820" font-family="Inkfree, 'Comic Sans MS', sans-serif" font-size="13">
  <defs>
    <style>
      .sk { fill: none; stroke: #1c1c1c; stroke-linecap: round; stroke-linejoin: round; }
      .sk-thick { stroke-width: 2.4; }
      .sk-med   { stroke-width: 1.8; }
      .sk-thin  { stroke-width: 1.2; }
      .label    { fill: #1c1c1c; }
      .leader   { fill: none; stroke: #555; stroke-width: 0.9; stroke-dasharray: 3 2.5; }
      .screen   { fill: #11141a; }
      .screen-text { fill: #cdebff; font-family: 'Courier New', monospace; font-size: 22; }
      .btn-fill { fill: #f4f3ef; }
      .ir-fill  { fill: #2a2a30; }
      .voice    { fill: #f2e7c8; }
      .voice-ring { fill: none; stroke: #b85c1a; stroke-width: 2.4; stroke-dasharray: 1 3; }
      .accent   { fill: #d83b3b; }
    </style>
    <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
      <path d="M 0 3 L 6 0 L 6 6 Z" fill="#888" />
    </marker>
  </defs>

  <rect x="6" y="6" width="688" height="808" fill="none" stroke="#1c1c1c" stroke-width="1" />
  <text x="22" y="32" class="label" font-size="14" font-weight="bold">LAUR — concept sketch (rev. {{revLabel}})</text>
  <text x="22" y="50" class="label" font-size="11" fill="#666">industrial-design pass · {{providerLabel}}</text>
  <text x="22" y="66" class="label" font-size="11" fill="#666" font-style="italic">"voice handles the complicated stuff · physical keys do the obvious ones"</text>

  <path class="sk sk-thick"
        d="M 245 100
           Q 240 96 248 90
           L 452 90
           Q 462 90 462 102
           L 462 740
           Q 462 758 444 764
           L 256 764
           Q 240 758 240 742
           L 240 106
           Q 240 102 245 100 Z" />
  <path class="sk sk-thin" d="M 252 122 L 452 122" opacity="0.5" />
  <path class="sk sk-thin" d="M 252 746 L 452 746" opacity="0.5" />

  <circle class="sk sk-med btn-fill" cx="278" cy="148" r="16" />
  <path d="M 278 138 L 278 148 M 271 142 A 10 10 0 1 0 285 142" stroke="#d83b3b" stroke-width="2" fill="none" />
  <text x="278" y="180" text-anchor="middle" font-size="10" fill="#444">power</text>

  <circle class="sk sk-med btn-fill" cx="424" cy="148" r="16" />
  <path d="M 416 144 L 421 144 L 426 138 L 426 158 L 421 152 L 416 152 Z" fill="#444" />
  <line x1="418" y1="140" x2="430" y2="156" stroke="#d83b3b" stroke-width="1.8" />
  <text x="424" y="180" text-anchor="middle" font-size="10" fill="#444">mute</text>

  <rect class="sk sk-med" x="296" y="204" width="110" height="56" rx="6" />
  <rect class="screen" x="302" y="210" width="98" height="44" rx="3" />
  <text x="310" y="240" class="screen-text" font-size="16">{{screenTime}}</text>
  <text x="356" y="226" class="screen-text" font-size="8" fill="#7aa2c2">tv · src 1</text>
  <text x="356" y="246" class="screen-text" font-size="8" fill="#7aa2c2">vol 18</text>


  <rect class="sk sk-med btn-fill" x="246" y="320" width="36" height="92" rx="16" />
  <path class="sk sk-thin" d="M 256 342 L 264 332 L 272 342" stroke-linecap="round" />
  <path class="sk sk-thin" d="M 256 392 L 264 402 L 272 392" stroke-linecap="round" />
  <line class="sk sk-thin" x1="254" y1="366" x2="274" y2="366" opacity="0.4" />
  <text x="264" y="425" text-anchor="middle" font-size="10" fill="#444">vol</text>

  <rect class="sk sk-med btn-fill" x="420" y="320" width="36" height="92" rx="16" />
  <path class="sk sk-thin" d="M 430 342 L 438 332 L 446 342" stroke-linecap="round" />
  <path class="sk sk-thin" d="M 430 392 L 438 402 L 446 392" stroke-linecap="round" />
  <line class="sk sk-thin" x1="428" y1="366" x2="448" y2="366" opacity="0.4" />
  <text x="438" y="425" text-anchor="middle" font-size="10" fill="#444">ch</text>

  <circle class="voice-ring" cx="351" cy="366" r="58" />
  <circle class="sk sk-med voice" cx="351" cy="366" r="50" />
  <circle class="sk sk-thin" cx="351" cy="366" r="44" opacity="0.5" />
  <g transform="translate(351 354)">
    <rect x="-9" y="-22" width="18" height="34" rx="9" fill="#1c1c1c" />
    <path class="sk sk-med" d="M -18 8 Q -18 22 0 22 Q 18 22 18 8" />
    <line x1="0" y1="22" x2="0" y2="32" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
    <line x1="-8" y1="32" x2="8" y2="32" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
  </g>
  <text x="351" y="440" text-anchor="middle" font-size="11" fill="#333">press · hold · speak</text>

  <g transform="translate(264 484)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="20" />
    <path class="sk sk-thin" d="M 32 17 A 11 11 0 1 0 32 27" stroke-width="2" />
    <polygon points="32,12 36,18 28,18" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">30</text>
    <text x="22" y="60" text-anchor="middle" font-size="10" fill="#444">back 30s</text>
  </g>
  <g transform="translate(327 484)">
    <rect class="sk sk-med btn-fill" x="0" y="0" width="48" height="44" rx="22" />
    <polygon points="14,12 14,32 24,22" fill="#444" />
    <rect x="30" y="12" width="3" height="20" fill="#444" />
    <rect x="35" y="12" width="3" height="20" fill="#444" />
    <text x="24" y="60" text-anchor="middle" font-size="10" fill="#444">play / pause</text>
  </g>
  <g transform="translate(394 484)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="20" />
    <polygon points="10,12 22,22 10,32" fill="#444" />
    <polygon points="22,12 34,22 22,32" fill="#444" />
    <text x="22" y="60" text-anchor="middle" font-size="10" fill="#444">fast fwd</text>
  </g>

  <text x="351" y="610" text-anchor="middle" font-size="12" fill="#666" font-style="italic">the less annoying universal remote</text>

  <circle class="sk sk-thin ir-fill" cx="442" cy="94" r="2.5" />

  <rect class="ir-fill" x="320" y="704" width="62" height="22" rx="3" />
  <rect class="sk sk-thin" x="320" y="704" width="62" height="22" rx="3" />


  <path class="leader" d="M 261 148 Q 200 145 165 138" />
  <text x="60" y="134" class="label">power</text>
  <text x="60" y="148" class="label" fill="#666" font-size="11">isolated up top —</text>
  <text x="60" y="162" class="label" fill="#666" font-size="11">won't get bumped</text>

  <path class="leader" d="M 441 148 Q 500 145 535 138" />
  <text x="540" y="134" class="label">mute</text>
  <text x="540" y="148" class="label" fill="#666" font-size="11">categorically</text>
  <text x="540" y="162" class="label" fill="#666" font-size="11">≠ volume; far away</text>

  <path class="leader" d="M 296 230 Q 200 240 165 244" />
  <text x="60" y="246" class="label">OLED status</text>
  <text x="60" y="260" class="label" fill="#666" font-size="11">1.5" mono · dims under 12 lux</text>

  <path class="leader" d="M 247 365 Q 180 365 145 360" />
  <text x="50" y="346" class="label">volume rocker</text>
  <text x="50" y="360" class="label" fill="#666" font-size="11">up / down · auto-repeat</text>
  <text x="50" y="374" class="label" fill="#666" font-size="11">on hold</text>

  <path class="leader" d="M 401 366 Q 470 300 535 256" />
  <text x="540" y="244" class="label" font-weight="bold">VOICE</text>
  <text x="540" y="258" class="label" fill="#666" font-size="11">centerpiece · press &amp; hold</text>
  <text x="540" y="272" class="label" fill="#666" font-size="11">handles search, apps,</text>
  <text x="540" y="286" class="label" fill="#666" font-size="11">source, menu — everything</text>
  <text x="540" y="300" class="label" fill="#666" font-size="11">beyond the keys on this face</text>

  <path class="leader" d="M 457 365 Q 530 380 575 388" />
  <text x="580" y="374" class="label">channel rocker</text>
  <text x="580" y="388" class="label" fill="#666" font-size="11">up / down</text>
  <text x="580" y="402" class="label" fill="#666" font-size="11">(broadcast / cable only)</text>

  <path class="leader" d="M 351 540 Q 200 555 145 555" />
  <text x="50" y="545" class="label">transport row</text>
  <text x="50" y="559" class="label" fill="#666" font-size="11">skip back 30s · play/pause</text>
  <text x="50" y="573" class="label" fill="#666" font-size="11">· fast forward</text>

  <path class="leader" d="M 448 92 Q 520 88 565 92" />
  <text x="565" y="96" class="label" font-size="11">mic port</text>
  <text x="565" y="109" class="label" fill="#666" font-size="10">far-field MEMS · top edge</text>

  <path class="sk sk-thin" d="M 462 600 L 540 600 L 540 580 L 612 580" />
  <text x="540" y="575" class="label" font-size="11">battery hatch (rear)</text>
  <text x="540" y="588" class="label" fill="#666" font-size="10">2× AA · {{batteryLifeMonths}} typical</text>

  <path class="leader" d="M 460 444 Q 525 444 565 450" />
  <text x="565" y="454" class="label" font-size="11">grip taper</text>
  <text x="565" y="467" class="label" fill="#666" font-size="10">matte ABS w/ thumb scoop</text>

  <path class="leader" d="M 320 716 Q 250 734 175 734" />
  <text x="60" y="728" class="label">IR transmitter</text>
  <text x="60" y="742" class="label" fill="#666" font-size="11">38 kHz · {{irProtocols}}</text>

  <line x1="240" y1="800" x2="462" y2="800" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="351" y="816" text-anchor="middle" font-size="11" fill="#888">58 mm</text>

  <line x1="478" y1="90" x2="478" y2="764" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="486" y="430" font-size="11" fill="#888">182 mm</text>
</svg>`;
