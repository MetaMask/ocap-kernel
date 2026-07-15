/**
 * Master markdown for the firmware spec artifact (round 1 of the
 * firmware service's two-step delivery). Token markers (`{{...}}`)
 * are filled in by `template.ts` on each `specify()` call.
 *
 * Token catalog:
 *   {{mcu}}             MCU part number
 *   {{irGpio}}          IR-driver pin label (varies by MCU)
 *   {{debounceMs}}      button debounce in ms
 *   {{idleTimeoutSec}}  idle-to-sleep threshold in seconds
 */
export const MASTER_MD = `# LAUR firmware specification

**Target MCU:** \`{{mcu}}\` (selected from BOM)
**Toolchain:** PlatformIO + ESP-IDF
**Estimated flash:** 768 KB · **Estimated RAM:** 220 KB peak
**Design intent:** voice handles every command that isn't an obvious
playback control; the firmware's job is to make the voice path feel
instant and reliable.

## 1. Boot sequence

1. CPU comes up under bootloader; primary firmware partition verified
   against its embedded signature.
2. Power-management domain initialized; IR PA, OLED, and microphone
   rails remain gated.
3. Persistent settings loaded from flash (\`config.json\`): paired
   devices, learned voice commands, OLED brightness profile, IR
   protocol preferences.
4. All ten button GPIOs sampled once for stuck-key detection; if any
   key is asserted at boot, enter \`pairing\` mode rather than \`idle\`.
5. OLED initialized; splash drawn for 300 ms.
6. Transition to \`idle\`.

## 2. Main state machine

\`\`\`
       ┌──────────┐  press(voice)   ┌──────────┐
       │   idle   │ ──────────────▶ │ listening│
       └────┬─────┘                 └────┬─────┘
            │ press(playback key)        │ release(voice)
            ▼                            ▼
       ┌──────────┐                 ┌──────────┐
       │ transmit │                 │ resolving│
       └────┬─────┘                 └────┬─────┘
            │ idle({{idleTimeoutSec}} s) │ command → transmit
            ▼                            │ unknown → notify
       ┌──────────┐                      │
       │  sleep   │ ◀────────────────────┘
       └──────────┘
\`\`\`

- \`idle\`: OLED on, mic gated. GPIO interrupts armed on all 10 keys.
- \`listening\`: voice key pressed; mic powered, I2S DMA running,
  audio streamed to companion / cloud. OLED shows "listening" + a
  rolling level indicator.
- \`resolving\`: voice key released; tail of audio flushed, NLU
  response awaited (typical 250–800 ms).
- \`transmit\`: IR PA pulsed for the resolved command; OLED shows
  what was sent.
- \`sleep\`: enters Deep Sleep after {{idleTimeoutSec}} s idle. Any
  key wakes; typical wake latency under 80 ms, OLED redraws within
  150 ms.

## 3. IR transmission

Supported protocols, listed in priority order for protocol detection
during pairing:

- NEC (most consumer IR)
- RC-5 (Philips, older European AV)
- RC-6 (newer Philips + Microsoft Media Center)
- Sony SIRC (Sony AV)

- IR PA driven by {{irGpio}} at 38 kHz carrier with software PWM (no
  dedicated peripheral required).
- Per-keypress timing tolerance ±50 µs against the cited reference
  implementations.
- Per-protocol command lookup table compiled into firmware from the
  paired devices' codes plus voice-resolved command IDs returned by
  the NLU service.

## 4. Voice input

- Microphone: SPH0645LM4H MEMS, omnidirectional, top-edge port.
- Interface: I2S, 16 kHz / 24-bit, single channel.
- Activation: hardware-level press on the voice key powers the mic
  rail and starts I2S DMA before any software runs (~5 ms latency
  to first audio sample after the press).
- Streaming: audio chunks pushed over BLE to the companion app,
  which forwards to the user's chosen NLU backend. No on-device
  STT in v1 — the device is the microphone-and-button, the cloud
  is the brain.
- Privacy: mic rail is hard-gated by the voice key. Software cannot
  power the mic without the user holding the button.
- LED ring around the voice key pulses orange while audio is
  streaming so the user has unambiguous feedback that the mic is
  hot.

## 5. Button handling

- Hardware: 10 individual GPIOs (one per button), each with internal
  pull-up.
- Voice button (KEY0) wired additionally to the wake-from-deep-sleep
  pin so it can power the system without an intervening press.
- Per-key debounce: {{debounceMs}} ms hold-stable required before a
  press event fires; same on release.
- Long-press threshold: 600 ms (used only for voice key — held
  beyond 600 ms means "continue listening past end-of-utterance").
- Repeat: 50 ms cadence after 400 ms hold (volume keys only).
- Simultaneous keys: voice + any single playback key recognized
  (e.g., voice + mute mutes immediately rather than going through
  NLU); other combos ignored.

## 6. Power management

- **Idle:** OLED on, mic gated, IR PA gated, MCU in DFS at lowest
  viable frequency. Estimated draw: 12 mA @ 3.3 V.
- **Listening:** OLED on, mic powered, I2S DMA active, BLE radio
  active. Estimated draw: 28 mA @ 3.3 V; only sustained while the
  voice key is held.
- **Sleep:** OLED off, MCU in Deep Sleep, GPIO wake. Estimated
  draw: 18 µA @ 3.3 V.
- **Transmit:** OLED on at scheduled refresh, IR PA pulsed, MCU at
  full clock. Estimated peak draw: 110 mA for ≤30 ms per command.

Battery target: 2× AA alkaline cells (3.0 V nominal) → ≥18 months
at ~10 voice commands/day + ~30 direct keypresses/day.

## 7. Over-the-air updates

- Companion app pushes signed firmware images over BLE GATT.
- Dual-partition layout: A/B with rollback on boot-counter timeout.
- Signature verification against a baked-in public key; downgrade
  protection via monotonic version counter in eFuse / OTP.
- User confirmation required at the device before applying —
  pairing flow won't let an installed image be replaced silently.

## 8. Out of scope for v1

- On-device STT or wake-word detection.
- Bluetooth control of non-IR devices (Apple TV, Roku, etc.) —
  reserved for v2 once the cloud NLU path is proven.
- Multi-user voice profiles.
`;
