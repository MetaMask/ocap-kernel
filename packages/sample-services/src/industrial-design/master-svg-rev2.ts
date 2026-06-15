/**
 * Revision-2 master SVG for the industrial-design concept sketch.
 * Returned by the service on the second and subsequent generate()
 * calls so a revision request produces a visibly different artifact.
 *
 * Differences from rev1 (driven by typical inventor feedback):
 *   - Body reshaped from a flat slab into a rounded, hand-shaped
 *     outline — widest through the upper-middle where the controls
 *     cluster, tapering toward a narrower bottom.
 *   - Channel rocker replaced by a finger-sized d-pad with a centre
 *     OK button. The d-pad mirrors the volume rocker on the left,
 *     enlarged to comfortable-thumb size and pulled in from the
 *     body edge by a small margin.
 *   - Voice button moved upward, out of the rocker level, so the
 *     d-pad and vol rocker can both grow without crowding.
 *   - Transport row updated to back-6s / play-pause / fwd-30s, with
 *     the rewind / fast-forward circular arrows oriented correctly
 *     (back curls counter-clockwise with the arrowhead on the left;
 *     fwd curls clockwise with the arrowhead on the right). The
 *     arrowheads sit at the actual arc endpoints.
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
        d="M 286 92
           C 244 96, 222 130, 214 200
           C 206 280, 204 380, 210 470
           C 218 560, 232 650, 252 710
           C 268 748, 290 760, 314 762
           L 386 762
           C 410 760, 432 748, 448 710
           C 468 650, 482 560, 490 470
           C 496 380, 494 280, 486 200
           C 478 130, 456 96, 414 92
           L 286 92 Z" />

  <rect class="ir-fill" x="320" y="98" width="62" height="12" rx="3" />
  <rect class="sk sk-thin" x="320" y="98" width="62" height="12" rx="3" />

  <circle class="sk sk-thin ir-fill" cx="252" cy="106" r="2.5" />

  <circle class="sk sk-med btn-fill" cx="290" cy="160" r="18" />
  <path d="M 290 148 L 290 160 M 282 153 A 11 11 0 1 0 298 153" stroke="#d83b3b" stroke-width="2" fill="none" />
  <text x="290" y="194" text-anchor="middle" font-size="10" fill="#444">power</text>

  <circle class="sk sk-med btn-fill" cx="410" cy="160" r="18" />
  <path d="M 402 156 L 407 156 L 412 150 L 412 170 L 407 164 L 402 164 Z" fill="#444" />
  <line x1="404" y1="152" x2="416" y2="168" stroke="#d83b3b" stroke-width="1.8" />
  <text x="410" y="194" text-anchor="middle" font-size="10" fill="#444">mute</text>

  <rect class="sk sk-med" x="296" y="208" width="108" height="50" rx="6" />
  <rect class="screen" x="302" y="214" width="96" height="38" rx="3" />
  <text x="310" y="242" class="screen-text" font-size="14">{{screenTime}}</text>
  <text x="354" y="230" class="screen-text" font-size="8" fill="#7aa2c2">tv · src 1</text>
  <text x="354" y="248" class="screen-text" font-size="8" fill="#7aa2c2">vol 18</text>

  <circle class="voice-ring" cx="350" cy="310" r="50" />
  <circle class="sk sk-med voice" cx="350" cy="310" r="42" />
  <circle class="sk sk-thin" cx="350" cy="310" r="36" opacity="0.5" />
  <g transform="translate(350 301)">
    <rect x="-8" y="-20" width="16" height="32" rx="8" fill="#1c1c1c" />
    <path class="sk sk-med" d="M -16 8 Q -16 22 0 22 Q 16 22 16 8" />
    <line x1="0" y1="22" x2="0" y2="30" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
    <line x1="-7" y1="30" x2="7" y2="30" stroke="#1c1c1c" stroke-width="2.4" stroke-linecap="round" />
  </g>
  <text x="350" y="380" text-anchor="middle" font-size="11" fill="#333">press · hold · speak</text>

  <rect class="sk sk-med btn-fill" x="218" y="405" width="36" height="120" rx="16" />
  <path class="sk sk-thin" d="M 228 433 L 236 421 L 244 433" stroke-linecap="round" />
  <path class="sk sk-thin" d="M 228 501 L 236 513 L 244 501" stroke-linecap="round" />
  <line class="sk sk-thin" x1="226" y1="465" x2="246" y2="465" opacity="0.4" />
  <text x="236" y="542" text-anchor="middle" font-size="10" fill="#444">vol</text>

  <g transform="translate(446 465)">
    <circle class="sk sk-thin" cx="0" cy="0" r="46" fill="none" opacity="0.35" />
    <rect class="sk sk-med btn-fill" x="-13" y="-42" width="26" height="20" rx="3" />
    <polygon points="-6,-28 6,-28 0,-36" fill="#444" />
    <rect class="sk sk-med btn-fill" x="-13" y="22"  width="26" height="20" rx="3" />
    <polygon points="-6,28 6,28 0,36" fill="#444" />
    <rect class="sk sk-med btn-fill" x="-42" y="-13" width="20" height="26" rx="3" />
    <polygon points="-28,-6 -28,6 -36,0" fill="#444" />
    <rect class="sk sk-med btn-fill" x="22"  y="-13" width="20" height="26" rx="3" />
    <polygon points="28,-6 28,6 36,0" fill="#444" />
    <circle class="sk sk-med btn-fill" cx="0" cy="0" r="13" />
    <text x="0" y="3" text-anchor="middle" font-size="8" fill="#444">OK</text>
  </g>
  <text x="446" y="542" text-anchor="middle" font-size="10" fill="#444">d-pad</text>

  <g transform="translate(250 596)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="22" />
    <path class="sk sk-thin" d="M 36 22 A 14 14 0 1 0 22 8" stroke-width="2" fill="none" />
    <polygon points="22,8 28,4 28,12" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">6</text>
    <text x="22" y="64" text-anchor="middle" font-size="10" fill="#444">back 6s</text>
  </g>
  <g transform="translate(326 596)">
    <rect class="sk sk-med btn-fill" x="0" y="0" width="48" height="44" rx="22" />
    <polygon points="14,12 14,32 25,22" fill="#444" />
    <rect x="31" y="12" width="3" height="20" fill="#444" />
    <rect x="36" y="12" width="3" height="20" fill="#444" />
    <text x="24" y="64" text-anchor="middle" font-size="10" fill="#444">play / pause</text>
  </g>
  <g transform="translate(402 596)">
    <circle class="sk sk-med btn-fill" cx="22" cy="22" r="22" />
    <path class="sk sk-thin" d="M 8 22 A 14 14 0 1 1 22 8" stroke-width="2" fill="none" />
    <polygon points="22,8 16,4 16,12" fill="#444" />
    <text x="22" y="26" text-anchor="middle" font-size="9" fill="#444">30</text>
    <text x="22" y="64" text-anchor="middle" font-size="10" fill="#444">fwd 30s</text>
  </g>

  <text x="350" y="708" text-anchor="middle" font-size="12" fill="#666" font-style="italic">the less annoying universal remote</text>

  <path class="leader" d="M 322 104 Q 240 110 158 100" />
  <text x="56" y="86" class="label">IR transmitter</text>
  <text x="56" y="100" class="label" fill="#666" font-size="11">on the top edge —</text>
  <text x="56" y="114" class="label" fill="#666" font-size="11">light path unobstructed</text>
  <text x="56" y="128" class="label" fill="#666" font-size="11">38 kHz · {{irProtocols}}</text>

  <path class="leader" d="M 250 108 Q 180 145 130 150" />
  <text x="56" y="148" class="label" font-size="11">mic port</text>
  <text x="56" y="162" class="label" fill="#666" font-size="11">far-field MEMS · top edge</text>

  <path class="leader" d="M 272 160 Q 200 178 140 184" />
  <text x="56" y="178" class="label">power</text>
  <text x="56" y="192" class="label" fill="#666" font-size="11">isolated up top —</text>
  <text x="56" y="206" class="label" fill="#666" font-size="11">won't get bumped</text>

  <path class="leader" d="M 296 232 Q 200 244 140 248" />
  <text x="56" y="246" class="label">OLED status</text>
  <text x="56" y="260" class="label" fill="#666" font-size="11">1.5" mono · dims under 12 lux</text>

  <path class="leader" d="M 218 465 Q 160 465 110 460" />
  <text x="42" y="446" class="label">volume rocker</text>
  <text x="42" y="460" class="label" fill="#666" font-size="11">up / down · auto-repeat</text>
  <text x="42" y="474" class="label" fill="#666" font-size="11">on hold</text>

  <path class="leader" d="M 250 618 Q 170 618 110 618" />
  <text x="42" y="608" class="label">transport row</text>
  <text x="42" y="622" class="label" fill="#666" font-size="11">back 6s (commercial</text>
  <text x="42" y="636" class="label" fill="#666" font-size="11">zap) · play/pause · fwd 30s</text>

  <path class="leader" d="M 428 160 Q 510 178 570 184" />
  <text x="568" y="178" class="label">mute</text>
  <text x="568" y="192" class="label" fill="#666" font-size="11">categorically</text>
  <text x="568" y="206" class="label" fill="#666" font-size="11">≠ volume; far away</text>

  <path class="leader" d="M 400 310 Q 460 295 510 286" />
  <text x="516" y="276" class="label" font-weight="bold">VOICE</text>
  <text x="516" y="290" class="label" fill="#666" font-size="11">centerpiece · press &amp; hold</text>
  <text x="516" y="304" class="label" fill="#666" font-size="11">handles search, apps,</text>
  <text x="516" y="318" class="label" fill="#666" font-size="11">source, menu — everything</text>
  <text x="516" y="332" class="label" fill="#666" font-size="11">beyond these keys</text>

  <path class="leader" d="M 488 465 Q 540 458 570 452" />
  <text x="568" y="446" class="label">d-pad + OK</text>
  <text x="568" y="460" class="label" fill="#666" font-size="11">up / down / left / right</text>
  <text x="568" y="474" class="label" fill="#666" font-size="11">drives streaming UIs</text>

  <path class="leader" d="M 488 540 Q 540 552 568 562" />
  <text x="568" y="570" class="label" font-size="11">grip taper</text>
  <text x="568" y="584" class="label" fill="#666" font-size="10">ellipsoidal · matte ABS</text>
  <text x="568" y="598" class="label" fill="#666" font-size="10">fits the palm</text>

  <path class="sk sk-thin" d="M 478 630 L 535 630 L 535 610 L 605 610" />
  <text x="540" y="604" class="label" font-size="11">battery hatch (rear)</text>
  <text x="540" y="624" class="label" fill="#666" font-size="10">2× AA · {{batteryLifeMonths}} typical</text>

  <line x1="200" y1="794" x2="500" y2="794" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="350" y="812" text-anchor="middle" font-size="11" fill="#888">70 mm</text>

  <line x1="514" y1="92" x2="514" y2="762" stroke="#888" stroke-width="0.8" marker-start="url(#arrow)" marker-end="url(#arrow)" />
  <text x="522" y="430" font-size="11" fill="#888">186 mm</text>
</svg>`;
