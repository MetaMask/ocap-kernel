/**
 * Revision-2 master SVG for the industrial-design concept sketch.
 * Returned by the service on the second and subsequent generate()
 * calls so a revision request produces a visibly different artifact.
 *
 * Differences from rev1 (driven by typical inventor feedback):
 *   - Body reshaped from a flat slab into a rounded, hand-shaped
 *     outline — wider through the palm-grip zone, smooth tapers at
 *     top and bottom.
 *   - Channel rocker replaced by a finger-sized d-pad with a centre
 *     OK button.
 *   - Voice button moved upward to clear vertical space for the
 *     d-pad to sit beneath it without crowding either control.
 *   - Transport row updated to back-6s / play-pause / fwd-30s
 *     (the commercial-zap pair).
 *   - IR transmitter strip moved from the bottom face to the top
 *     edge, so the user's grip doesn't block the outgoing light path.
 *
 * Token catalog (same as rev1):
 *   {{revLabel}}            short rev label, e.g. "A2"
 *   {{providerLabel}}       provider identifier in the corner
 *   {{screenTime}}          clock string shown on the OLED
 *   {{batteryLifeMonths}}   battery life label
 *   {{irProtocols}}         IR protocol list
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
  <text x="22" y="32" class="label" font-size="14" font-weight="bold">LAUR — concept sketch (rev. {{revLabel}})</text>
  <text x="22" y="50" class="label" font-size="11" fill="#666">industrial-design pass · {{providerLabel}}</text>
  <text x="22" y="66" class="label" font-size="11" fill="#666" font-style="italic">rev. 2 — hand-shaped shell, d-pad, IR top, 6s/30s transport</text>

  <path class="sk sk-thick"
        d="M 268 96
           C 240 102, 218 130, 212 200
           C 206 280, 204 380, 212 470
           C 220 560, 232 660, 252 720
           C 264 748, 286 760, 312 762
           L 388 762
           C 414 760, 436 748, 448 720
           C 468 660, 480 560, 488 470
           C 496 380, 494 280, 488 200
           C 482 130, 460 102, 432 96
           L 268 96 Z" />

  <circle class="sk sk-med btn-fill" cx="282" cy="180" r="18" />
  <path d="M 282 168 L 282 180 M 274 173 A 11 11 0 1 0 290 173" stroke="#d83b3b" stroke-width="2" fill="none" />
  <text x="282" y="216" text-anchor="middle" font-size="10" fill="#444">power</text>

  <circle class="sk sk-med btn-fill" cx="418" cy="180" r="18" />
  <path d="M 410 176 L 415 176 L 420 170 L 420 190 L 415 184 L 410 184 Z" fill="#444" />
  <line x1="412" y1="172" x2="424" y2="188" stroke="#d83b3b" stroke-width="1.8" />
  <text x="418" y="216" text-anchor="middle" font-size="10" fill="#444">mute</text>

  <rect class="sk sk-med" x="293" y="240" width="114" height="56" rx="6" />
  <rect class="screen" x="299" y="246" width="102" height="44" rx="3" />
  <text x="309" y="276" class="screen-text" font-size="16">{{screenTime}}</text>
  <text x="355" y="262" class="screen-text" font-size="8" fill="#7aa2c2">tv · src 1</text>
  <text x="355" y="282" class="screen-text" font-size="8" fill="#7aa2c2">vol 18</text>

  <rect class="sk sk-med btn-fill" x="240" y="318" width="34" height="120" rx="16" />
  <path class="sk sk-thin" d="M 250 344 L 257 332 L 264 344" stroke-linecap="round" />
  <path class="sk sk-thin" d="M 250 412 L 257 424 L 264 412" stroke-linecap="round" />
  <line class="sk sk-thin" x1="248" y1="378" x2="266" y2="378" opacity="0.4" />
  <text x="257" y="454" text-anchor="middle" font-size="10" fill="#444">vol</text>

  <circle class="voice-ring" cx="351" cy="368" r="62" />
  <circle class="sk sk-med voice" cx="351" cy="368" r="54" />
  <circle class="sk sk-thin" cx="351" cy="368" r="46" opacity="0.5" />
  <g transform="translate(351 356)">
    <rect x="-10" y="-26" width="20" height="38" rx="10" fill="#1c1c1c" />
    <path class="sk sk-med" d="M -20 8 Q -20 24 0 24 Q 20 24 20 8" />
    <line x1="0" y1="24" x2="0" y2="36" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
    <line x1="-9" y1="36" x2="9" y2="36" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
  </g>
  <text x="351" y="448" text-anchor="middle" font-size="11" fill="#333">press · hold · speak</text>

  <g transform="translate(351 510)">
    <circle class="sk sk-thin" cx="0" cy="0" r="48" fill="none" opacity="0.35" />
    <rect class="sk sk-med btn-fill" x="-15" y="-44" width="30" height="22" rx="4" />
    <polygon points="-7,-30 7,-30 0,-39" fill="#444" />
    <rect class="sk sk-med btn-fill" x="-15" y="22"  width="30" height="22" rx="4" />
    <polygon points="-7,30 7,30 0,39" fill="#444" />
    <rect class="sk sk-med btn-fill" x="-44" y="-15" width="22" height="30" rx="4" />
    <polygon points="-30,-7 -30,7 -39,0" fill="#444" />
    <rect class="sk sk-med btn-fill" x="22"  y="-15" width="22" height="30" rx="4" />
    <polygon points="30,-7 30,7 39,0" fill="#444" />
    <circle class="sk sk-med btn-fill" cx="0" cy="0" r="13" />
    <text x="0" y="3" text-anchor="middle" font-size="8" fill="#444">OK</text>
  </g>
  <text x="351" y="580" text-anchor="middle" font-size="10" fill="#444">d-pad</text>

  <g transform="translate(258 620)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="22" />
    <path class="sk sk-thin" d="M 33 17 A 12 12 0 1 0 33 27" stroke-width="2" />
    <polygon points="33,11 38,18 28,18" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">6</text>
    <text x="22" y="64" text-anchor="middle" font-size="10" fill="#444">back 6s</text>
  </g>
  <g transform="translate(326 620)">
    <rect class="sk sk-med btn-fill" x="0" y="0" width="50" height="44" rx="22" />
    <polygon points="14,12 14,32 25,22" fill="#444" />
    <rect x="31" y="12" width="3" height="20" fill="#444" />
    <rect x="36" y="12" width="3" height="20" fill="#444" />
    <text x="25" y="64" text-anchor="middle" font-size="10" fill="#444">play / pause</text>
  </g>
  <g transform="translate(398 620)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="22" />
    <path class="sk sk-thin" d="M 11 17 A 12 12 0 1 1 11 27" stroke-width="2" />
    <polygon points="11,11 16,18 6,18" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">30</text>
    <text x="22" y="64" text-anchor="middle" font-size="10" fill="#444">fwd 30s</text>
  </g>

  <text x="351" y="720" text-anchor="middle" font-size="12" fill="#666" font-style="italic">the less annoying universal remote</text>

  <rect class="ir-fill" x="320" y="100" width="62" height="14" rx="3" />
  <rect class="sk sk-thin" x="320" y="100" width="62" height="14" rx="3" />

  <circle class="sk sk-thin ir-fill" cx="266" cy="104" r="2.5" />

  <path class="leader" d="M 322 106 Q 240 80 165 76" />
  <text x="62" y="62" class="label">IR transmitter</text>
  <text x="62" y="76" class="label" fill="#666" font-size="11">on the top edge —</text>
  <text x="62" y="90" class="label" fill="#666" font-size="11">light path unobstructed</text>
  <text x="62" y="104" class="label" fill="#666" font-size="11">38 kHz · {{irProtocols}}</text>

  <path class="leader" d="M 263 104 Q 200 130 140 140" />
  <text x="62" y="136" class="label" font-size="11">mic port</text>
  <text x="62" y="150" class="label" fill="#666" font-size="11">far-field MEMS · top edge</text>

  <path class="leader" d="M 264 180 Q 180 188 130 196" />
  <text x="62" y="190" class="label">power</text>
  <text x="62" y="204" class="label" fill="#666" font-size="11">isolated up top —</text>
  <text x="62" y="218" class="label" fill="#666" font-size="11">won't get bumped</text>

  <path class="leader" d="M 293 268 Q 200 268 140 268" />
  <text x="62" y="264" class="label">OLED status</text>
  <text x="62" y="278" class="label" fill="#666" font-size="11">1.5" mono · dims under 12 lux</text>

  <path class="leader" d="M 240 378 Q 160 378 110 360" />
  <text x="46" y="346" class="label">volume rocker</text>
  <text x="46" y="360" class="label" fill="#666" font-size="11">up / down · auto-repeat</text>
  <text x="46" y="374" class="label" fill="#666" font-size="11">on hold</text>

  <path class="leader" d="M 264 642 Q 160 642 110 632" />
  <text x="46" y="620" class="label">transport row</text>
  <text x="46" y="634" class="label" fill="#666" font-size="11">back 6s (commercial</text>
  <text x="46" y="648" class="label" fill="#666" font-size="11">zap) · play/pause · fwd 30s</text>

  <path class="leader" d="M 436 180 Q 520 186 590 196" />
  <text x="566" y="190" class="label">mute</text>
  <text x="566" y="204" class="label" fill="#666" font-size="11">categorically</text>
  <text x="566" y="218" class="label" fill="#666" font-size="11">≠ volume; far away</text>

  <path class="leader" d="M 405 368 Q 480 320 552 290" />
  <text x="566" y="280" class="label" font-weight="bold">VOICE</text>
  <text x="566" y="294" class="label" fill="#666" font-size="11">centerpiece · press &amp; hold</text>
  <text x="566" y="308" class="label" fill="#666" font-size="11">handles search, apps,</text>
  <text x="566" y="322" class="label" fill="#666" font-size="11">source, menu — everything</text>
  <text x="566" y="336" class="label" fill="#666" font-size="11">beyond the keys on this face</text>

  <path class="leader" d="M 399 510 Q 480 510 550 500" />
  <text x="566" y="490" class="label">d-pad + OK</text>
  <text x="566" y="504" class="label" fill="#666" font-size="11">up / down / left / right</text>
  <text x="566" y="518" class="label" fill="#666" font-size="11">drives streaming UIs</text>

  <path class="leader" d="M 484 470 Q 545 472 590 480" />
  <text x="566" y="558" class="label" font-size="11">grip taper</text>
  <text x="566" y="572" class="label" fill="#666" font-size="10">ellipsoidal · matte ABS</text>
  <text x="566" y="586" class="label" fill="#666" font-size="10">fits the palm</text>

  <path class="sk sk-thin" d="M 482 660 L 540 660 L 540 640 L 612 640" />
  <text x="540" y="634" class="label" font-size="11">battery hatch (rear)</text>
  <text x="540" y="648" class="label" fill="#666" font-size="10">2× AA · {{batteryLifeMonths}} typical</text>

  <line x1="210" y1="794" x2="490" y2="794" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="350" y="812" text-anchor="middle" font-size="11" fill="#888">67 mm</text>

  <line x1="510" y1="96" x2="510" y2="762" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="518" y="430" font-size="11" fill="#888">186 mm</text>
</svg>`;
