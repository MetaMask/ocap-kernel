/**
 * Revision-2 master SVG for the industrial-design concept sketch.
 * Returned by the service on the second and subsequent generate()
 * calls so a revision request produces a visibly different artifact.
 * Same token-substitution interface as `master-svg.ts`.
 *
 * Differences from rev1 (each driven by typical inventor feedback):
 *   - Channel rocker replaced by a d-pad with center OK
 *   - Transport row uses back 6s + play/pause + fwd 30s
 *   - IR transmitter strip moved to the top edge (light path
 *     unobstructed by the hand)
 *   - Body outline more curved / ellipsoidal in profile
 */
export const MASTER_SVG_REV2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 820" font-family="Inkfree, 'Comic Sans MS', sans-serif" font-size="13">
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
  <text x="22" y="32" class="label" font-size="14" font-weight="bold">LSUR — concept sketch (rev. {{revLabel}})</text>
  <text x="22" y="50" class="label" font-size="11" fill="#666">industrial-design pass · {{providerLabel}}</text>
  <text x="22" y="66" class="label" font-size="11" fill="#666" font-style="italic">revised after first-round review · ellipsoidal body, d-pad, IR top</text>

  <path class="sk sk-thick"
        d="M 260 100
           Q 230 100 226 160
           Q 222 280 232 420
           Q 240 580 258 720
           Q 268 770 320 770
           L 384 770
           Q 434 770 444 720
           Q 462 580 470 420
           Q 480 280 476 160
           Q 472 100 442 100 Z" />

  <circle class="sk sk-med btn-fill" cx="284" cy="152" r="16" />
  <path d="M 284 142 L 284 152 M 277 146 A 10 10 0 1 0 291 146" stroke="#d83b3b" stroke-width="2" fill="none" />
  <text x="284" y="184" text-anchor="middle" font-size="10" fill="#444">power</text>

  <circle class="sk sk-med btn-fill" cx="418" cy="152" r="16" />
  <path d="M 410 148 L 415 148 L 420 142 L 420 162 L 415 156 L 410 156 Z" fill="#444" />
  <line x1="412" y1="144" x2="424" y2="160" stroke="#d83b3b" stroke-width="1.8" />
  <text x="418" y="184" text-anchor="middle" font-size="10" fill="#444">mute</text>

  <rect class="sk sk-med" x="296" y="208" width="110" height="56" rx="6" />
  <rect class="screen" x="302" y="214" width="98" height="44" rx="3" />
  <text x="310" y="244" class="screen-text" font-size="16">{{screenTime}}</text>
  <text x="356" y="230" class="screen-text" font-size="8" fill="#7aa2c2">tv · src 1</text>
  <text x="356" y="250" class="screen-text" font-size="8" fill="#7aa2c2">vol 18</text>

  <rect class="sk sk-med btn-fill" x="254" y="320" width="36" height="92" rx="16" />
  <path class="sk sk-thin" d="M 264 342 L 272 332 L 280 342" stroke-linecap="round" />
  <path class="sk sk-thin" d="M 264 392 L 272 402 L 280 392" stroke-linecap="round" />
  <line class="sk sk-thin" x1="262" y1="366" x2="282" y2="366" opacity="0.4" />
  <text x="272" y="425" text-anchor="middle" font-size="10" fill="#444">vol</text>

  <g transform="translate(420 366)">
    <circle class="sk sk-med btn-fill" cx="0" cy="0" r="46" />
    <path class="sk sk-thin" d="M -34 0 L -10 0 M 10 0 L 34 0 M 0 -34 L 0 -10 M 0 10 L 0 34" />
    <circle class="sk sk-thin btn-fill" cx="0" cy="0" r="11" />
    <text x="0" y="3" text-anchor="middle" font-size="8" fill="#444">OK</text>
    <polygon points="-30,-3 -22,-7 -22,1" fill="#444" />
    <polygon points="30,-3 22,-7 22,1" fill="#444" />
    <polygon points="-3,-30 1,-22 -7,-22" fill="#444" />
    <polygon points="-3,30 1,22 -7,22" fill="#444" />
    <text x="0" y="68" text-anchor="middle" font-size="10" fill="#444">d-pad</text>
  </g>

  <circle class="voice-ring" cx="352" cy="370" r="58" />
  <circle class="sk sk-med voice" cx="352" cy="370" r="50" />
  <circle class="sk sk-thin" cx="352" cy="370" r="44" opacity="0.5" />
  <g transform="translate(352 358)">
    <rect x="-9" y="-22" width="18" height="34" rx="9" fill="#1c1c1c" />
    <path class="sk sk-med" d="M -18 8 Q -18 22 0 22 Q 18 22 18 8" />
    <line x1="0" y1="22" x2="0" y2="32" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
    <line x1="-8" y1="32" x2="8" y2="32" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
  </g>
  <text x="352" y="444" text-anchor="middle" font-size="11" fill="#333">press · hold · speak</text>

  <g transform="translate(266 500)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="20" />
    <path class="sk sk-thin" d="M 32 17 A 11 11 0 1 0 32 27" stroke-width="2" />
    <polygon points="32,12 36,18 28,18" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">6</text>
    <text x="22" y="60" text-anchor="middle" font-size="10" fill="#444">back 6s</text>
  </g>
  <g transform="translate(329 500)">
    <rect class="sk sk-med btn-fill" x="0" y="0" width="48" height="44" rx="22" />
    <polygon points="14,12 14,32 24,22" fill="#444" />
    <rect x="30" y="12" width="3" height="20" fill="#444" />
    <rect x="35" y="12" width="3" height="20" fill="#444" />
    <text x="24" y="60" text-anchor="middle" font-size="10" fill="#444">play / pause</text>
  </g>
  <g transform="translate(396 500)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="20" />
    <path class="sk sk-thin" d="M 12 17 A 11 11 0 1 1 12 27" stroke-width="2" />
    <polygon points="12,12 16,18 8,18" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">30</text>
    <text x="22" y="60" text-anchor="middle" font-size="10" fill="#444">fwd 30s</text>
  </g>

  <text x="352" y="620" text-anchor="middle" font-size="12" fill="#666" font-style="italic">the less annoying universal remote</text>

  <rect class="ir-fill" x="320" y="100" width="62" height="14" rx="3" />
  <rect class="sk sk-thin" x="320" y="100" width="62" height="14" rx="3" />

  <circle class="sk sk-thin ir-fill" cx="442" cy="116" r="2.5" />

  <path class="leader" d="M 267 152 Q 200 145 165 138" />
  <text x="60" y="134" class="label">power</text>
  <text x="60" y="148" class="label" fill="#666" font-size="11">isolated up top —</text>
  <text x="60" y="162" class="label" fill="#666" font-size="11">won't get bumped</text>

  <path class="leader" d="M 435 152 Q 500 145 535 138" />
  <text x="540" y="134" class="label">mute</text>
  <text x="540" y="148" class="label" fill="#666" font-size="11">categorically</text>
  <text x="540" y="162" class="label" fill="#666" font-size="11">≠ volume; far away</text>

  <path class="leader" d="M 320 108 Q 230 70 165 70" />
  <text x="60" y="68" class="label">IR transmitter</text>
  <text x="60" y="82" class="label" fill="#666" font-size="11">moved to top edge —</text>
  <text x="60" y="96" class="label" fill="#666" font-size="11">light path unobstructed</text>
  <text x="60" y="110" class="label" fill="#666" font-size="11">38 kHz · {{irProtocols}}</text>

  <path class="leader" d="M 296 232 Q 200 240 165 244" />
  <text x="60" y="246" class="label">OLED status</text>
  <text x="60" y="260" class="label" fill="#666" font-size="11">1.5" mono · dims under 12 lux</text>

  <path class="leader" d="M 254 365 Q 180 365 145 360" />
  <text x="50" y="346" class="label">volume rocker</text>
  <text x="50" y="360" class="label" fill="#666" font-size="11">up / down · auto-repeat</text>
  <text x="50" y="374" class="label" fill="#666" font-size="11">on hold</text>

  <path class="leader" d="M 410 370 Q 470 300 535 256" />
  <text x="540" y="244" class="label" font-weight="bold">VOICE</text>
  <text x="540" y="258" class="label" fill="#666" font-size="11">centerpiece · press &amp; hold</text>
  <text x="540" y="272" class="label" fill="#666" font-size="11">handles search, apps,</text>
  <text x="540" y="286" class="label" fill="#666" font-size="11">source, menu — everything</text>
  <text x="540" y="300" class="label" fill="#666" font-size="11">beyond the keys on this face</text>

  <path class="leader" d="M 466 366 Q 530 380 575 388" />
  <text x="580" y="374" class="label">d-pad + OK</text>
  <text x="580" y="388" class="label" fill="#666" font-size="11">up / down / left / right</text>
  <text x="580" y="402" class="label" fill="#666" font-size="11">drives streaming UIs</text>

  <path class="leader" d="M 352 552 Q 200 565 145 565" />
  <text x="50" y="555" class="label">transport row</text>
  <text x="50" y="569" class="label" fill="#666" font-size="11">back 6s (commercial</text>
  <text x="50" y="583" class="label" fill="#666" font-size="11">zap) · play/pause · fwd 30s</text>

  <path class="leader" d="M 448 114 Q 520 100 565 96" />
  <text x="565" y="100" class="label" font-size="11">mic port</text>
  <text x="565" y="113" class="label" fill="#666" font-size="10">far-field MEMS · top edge</text>

  <path class="sk sk-thin" d="M 470 600 L 540 600 L 540 580 L 612 580" />
  <text x="540" y="575" class="label" font-size="11">battery hatch (rear)</text>
  <text x="540" y="588" class="label" fill="#666" font-size="10">2× AA · {{batteryLifeMonths}} typical</text>

  <path class="leader" d="M 468 450 Q 525 450 565 456" />
  <text x="565" y="460" class="label" font-size="11">grip taper</text>
  <text x="565" y="473" class="label" fill="#666" font-size="10">ellipsoidal · matte ABS</text>
  <text x="565" y="486" class="label" fill="#666" font-size="10">fits the palm</text>

  <line x1="222" y1="800" x2="480" y2="800" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="351" y="816" text-anchor="middle" font-size="11" fill="#888">67 mm</text>

  <line x1="495" y1="100" x2="495" y2="770" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="502" y="430" font-size="11" fill="#888">186 mm</text>
</svg>`;
