/**
 * Master SVG for the mechanical-design hero render. Token markers
 * (`{{...}}`) are filled in by `template.ts` on each generate() call.
 *
 * Geometry mirrors the LAUR rev-2 industrial-design sketch:
 * hand-shaped body widest through the upper-middle, d-pad on the
 * right at the rocker level (replacing the rev-1 channel rocker),
 * IR transmitter strip on the top edge, transport row with
 * back-6s / play-pause / fwd-30s.
 *
 * Token catalog:
 *   {{revLabel}}              short rev label, e.g. "M1"
 *   {{providerLabel}}         provider identifier
 *   {{colorwayName}}          "matte black" / "soft white" / "smoke grey"
 *   {{caseColorHighlight}}    body gradient stop 0%
 *   {{caseColorMain}}         body gradient stop 45%
 *   {{caseColorShadow}}       body gradient stop 100% + side gradient 0%
 *   {{caseColorDeepShadow}}   side gradient stop 100%
 *
 * colorway* tokens are picked as a unit so the gradient remains
 * self-consistent.
 */
export const MASTER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 800" font-family="Arial, sans-serif" font-size="12">
  <defs>
    <linearGradient id="body-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="{{caseColorHighlight}}" />
      <stop offset="45%"  stop-color="{{caseColorMain}}" />
      <stop offset="100%" stop-color="{{caseColorShadow}}" />
    </linearGradient>
    <linearGradient id="side-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="{{caseColorShadow}}" />
      <stop offset="100%" stop-color="{{caseColorDeepShadow}}" />
    </linearGradient>
    <linearGradient id="screen-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#11141a" />
      <stop offset="100%" stop-color="#191c24" />
    </linearGradient>
    <radialGradient id="voice-grad" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0%" stop-color="#3a3a3a" />
      <stop offset="60%" stop-color="#2a2a2a" />
      <stop offset="100%" stop-color="#141414" />
    </radialGradient>
    <radialGradient id="floor-shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%"   stop-color="#000" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#000" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
  </defs>

  <rect width="900" height="800" fill="#f0f0ee" />
  <rect width="900" height="360" fill="#dfdfdc" />

  <ellipse cx="450" cy="770" rx="160" ry="14" fill="#000" opacity="0.18" />

  <g transform="translate(310 70)">
    <path d="M 90 14
             C 56 18, 38 58, 30 140
             C 22 230, 20 350, 26 470
             C 32 580, 46 660, 60 700
             C 70 720, 90 730, 110 730
             L 170 730
             C 190 730, 210 720, 220 700
             C 234 660, 248 580, 254 470
             C 260 350, 258 230, 250 140
             C 242 58, 224 18, 190 14
             L 90 14 Z"
          fill="url(#side-grad)" />

    <path d="M 86 12
             C 54 16, 36 56, 28 138
             C 20 228, 18 350, 24 470
             C 30 580, 44 658, 58 698
             C 68 718, 88 728, 108 728
             L 168 728
             C 188 728, 208 718, 218 698
             C 232 658, 246 580, 252 470
             C 258 350, 256 228, 248 138
             C 240 56, 222 16, 188 12
             L 86 12 Z"
          fill="url(#body-grad)" />

    <path d="M 88 14
             C 56 18, 38 50, 30 110
             L 250 110
             C 242 50, 224 18, 192 14
             L 88 14 Z"
          fill="url(#hl)" />

    <rect x="105" y="22" width="70" height="14" rx="3" fill="#0a0a0a" />
    <rect x="105" y="22" width="70" height="14" rx="3" fill="none" stroke="#222" stroke-width="0.6" />

    <circle cx="58" cy="106" r="3" fill="#070707" />

    <circle cx="84" cy="146" r="14" fill="#3a3a3a" />
    <path d="M 84 138 L 84 146 M 78 142 A 6 6 0 1 0 90 142"
          stroke="#d83b3b" stroke-width="1.6" fill="none" />

    <circle cx="194" cy="146" r="14" fill="#3a3a3a" />
    <path d="M 188 142 L 192 142 L 196 138 L 196 154 L 192 150 L 188 150 Z" fill="#dddddd" />
    <line x1="190" y1="139" x2="200" y2="153" stroke="#d83b3b" stroke-width="1.6" />

    <rect x="96" y="194" width="86" height="46" rx="5" fill="#0a0a0a" />
    <rect x="100" y="198" width="78" height="38" rx="3" fill="url(#screen-grad)" />
    <text x="108" y="226" font-family="'Courier New', monospace" fill="#cdebff" font-size="14">20:34</text>
    <text x="150" y="212" font-family="'Courier New', monospace" fill="#7aa2c2" font-size="8">tv · src 1</text>
    <text x="150" y="232" font-family="'Courier New', monospace" fill="#7aa2c2" font-size="8">vol 18</text>

    <circle cx="139" cy="318" r="54" fill="url(#voice-grad)" />
    <circle cx="139" cy="318" r="54" fill="none" stroke="#4a4a4a"
            stroke-width="2" opacity="0.7" />
    <circle cx="139" cy="318" r="46" fill="none" stroke="#1c1c1c"
            stroke-width="0.6" opacity="0.6" />
    <g transform="translate(139 306)">
      <rect x="-9" y="-18" width="18" height="30" rx="9" fill="#dddddd" />
      <path d="M -16 8 Q -16 22 0 22 Q 16 22 16 8"
            fill="none" stroke="#dddddd" stroke-width="2.2" stroke-linecap="round" />
      <line x1="0" y1="22" x2="0" y2="32" stroke="#dddddd" stroke-width="2.2" stroke-linecap="round" />
      <line x1="-7" y1="32" x2="7" y2="32" stroke="#dddddd" stroke-width="2.2" stroke-linecap="round" />
    </g>
    <circle cx="139" cy="318" r="58" fill="none" stroke="#b85c1a"
            stroke-width="1.2" opacity="0.3" />

    <rect x="58" y="402" width="28" height="120" rx="12" fill="#3a3a3a" />
    <path d="M 64 432 L 72 420 L 80 432" stroke="#dddddd" stroke-width="2"
          fill="none" stroke-linecap="round" />
    <path d="M 64 492 L 72 504 L 80 492" stroke="#dddddd" stroke-width="2"
          fill="none" stroke-linecap="round" />
    <line x1="62" y1="462" x2="82" y2="462" stroke="#1c1c1c" stroke-width="0.6" opacity="0.4" />

    <g transform="translate(208 462)">
      <circle cx="0" cy="0" r="38" fill="#2c2c2c" />
      <circle cx="0" cy="0" r="38" fill="none" stroke="#4a4a4a" stroke-width="1" />
      <rect x="-11" y="-34" width="22" height="16" rx="3" fill="#3a3a3a" />
      <polygon points="-5,-23 5,-23 0,-30" fill="#dddddd" />
      <rect x="-11" y="18"  width="22" height="16" rx="3" fill="#3a3a3a" />
      <polygon points="-5,23 5,23 0,30" fill="#dddddd" />
      <rect x="-34" y="-11" width="16" height="22" rx="3" fill="#3a3a3a" />
      <polygon points="-23,-5 -23,5 -30,0" fill="#dddddd" />
      <rect x="18"  y="-11" width="16" height="22" rx="3" fill="#3a3a3a" />
      <polygon points="23,-5 23,5 30,0" fill="#dddddd" />
      <circle cx="0" cy="0" r="10" fill="#4a4a4a" />
      <text x="0" y="3" text-anchor="middle" font-size="7" fill="#dddddd">OK</text>
    </g>

    <circle cx="78" cy="588" r="20" fill="#3a3a3a" />
    <path d="M 67 583 A 11 11 0 1 1 67 593" stroke="#dddddd" stroke-width="2" fill="none" />
    <polygon points="67,577 72,584 62,584" fill="#dddddd" />
    <text x="78" y="592" text-anchor="middle" fill="#1c1c1c" font-size="8">6</text>

    <rect x="118" y="568" width="42" height="42" rx="20" fill="#3a3a3a" />
    <polygon points="130,578 130,602 142,590" fill="#dddddd" />
    <rect x="148" y="578" width="3" height="24" fill="#dddddd" />
    <rect x="152" y="578" width="3" height="24" fill="#dddddd" />

    <circle cx="198" cy="588" r="20" fill="#3a3a3a" />
    <path d="M 209 583 A 11 11 0 1 0 209 593" stroke="#dddddd" stroke-width="2" fill="none" />
    <polygon points="209,577 214,584 204,584" fill="#dddddd" />
    <text x="198" y="592" text-anchor="middle" fill="#1c1c1c" font-size="8">30</text>

    <text x="139" y="680" text-anchor="middle" font-style="italic"
          font-size="11" fill="#dddddd" opacity="0.6">
      the less annoying universal remote
    </text>
  </g>

  <text x="40" y="40" font-size="16" font-weight="bold" fill="#1c1c1c">LAUR — mechanical case render</text>
  <text x="40" y="60" font-size="11" fill="#666">{{providerLabel}} · {{colorwayName}} · ABS+PC blend · 70 × 186 × 18 mm</text>

  <g transform="translate(40 210)" font-size="11" fill="#1c1c1c">
    <text font-weight="bold">Material</text>
    <text y="16" fill="#444">injection-molded ABS+PC blend</text>
    <text y="28" fill="#444">8% glass fiber loading</text>
    <text y="56" font-weight="bold">Wall thickness</text>
    <text y="72" fill="#444">2.5 mm uniform</text>
    <text y="100" font-weight="bold">Surface finish</text>
    <text y="116" fill="#444">MT11030 (matte texture)</text>
    <text y="144" font-weight="bold">Assembly</text>
    <text y="160" fill="#444">4 self-tapping screws</text>
  </g>

  <g transform="translate(700 210)" font-size="11" fill="#1c1c1c">
    <text font-weight="bold">Mass (loaded)</text>
    <text y="16" fill="#444">118 g (with 2× AA)</text>
    <text y="44" font-weight="bold">Drop test</text>
    <text y="60" fill="#444">1.2 m onto hardwood — pass</text>
    <text y="88" font-weight="bold">IP rating</text>
    <text y="104" fill="#444">IPX0 (indoor only)</text>
    <text y="132" font-weight="bold">IR / mic</text>
    <text y="148" fill="#444">both on the top edge</text>
  </g>

  <text x="450" y="772" text-anchor="middle" font-size="11" fill="#666">
    front 3/4 view; full CAD package on request · rev {{revLabel}}
  </text>
</svg>`;
