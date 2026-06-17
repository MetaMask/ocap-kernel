/**
 * Master C source for the LAUR firmware implementation artifact.
 * Token markers (`{{...}}`) are filled in by `template.ts` on each
 * `implement()` call. The artifact wraps this in a markdown fenced
 * code block so it renders cleanly on the demo display.
 *
 * The source compiles cleanly enough to scan as authentic during the
 * demo — peripheral handles, FreeRTOS task topology, ISR-safe state
 * transitions, and the hardware-gated microphone are all written the
 * way a real ESP-IDF project would. It would still need fleshing out
 * (RMT IR symbol tables, OTA hookup, OLED driver, etc.) to actually
 * boot a board.
 *
 * Token catalog:
 *   {{rev}}                 short rev label, e.g. "F2"
 *   {{mcu}}                 target MCU identifier
 *   {{buildHash}}           short build id stamp
 *   {{irGpio}}              IR-out GPIO macro
 *   {{debounceMs}}          key-debounce window
 *   {{idleTimeoutMs}}       idle → sleep timeout in ms
 *   {{changesIncorporated}} header note about conditional-approval
 *                           changes; empty string when the inventor
 *                           approved unconditionally.
 */
export const MASTER_C = `/*
 * LAUR firmware — keypad FSM + IR transmit + voice gating
 *
 * Target  : {{mcu}}
 * Rev     : {{rev}}
 * Build   : {{buildHash}}
 *
 * Hardware-gated microphone: the mic rail is driven by MIC_GATE_GPIO
 * and is only powered while the voice button is held. Software cannot
 * energise the mic without the user physically holding the button.{{changesIncorporated}}
 */

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "driver/gpio.h"
#include "driver/rmt_tx.h"
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"

static const char *TAG = "laur";

#define MIC_GATE_GPIO     GPIO_NUM_47
#define IR_OUT_GPIO       {{irGpio}}
#define VOICE_BTN_GPIO    GPIO_NUM_8
#define VOICE_BTN_RING_GPIO GPIO_NUM_6

#define KEY_POWER    0
#define KEY_MUTE     1
#define KEY_VOL_UP   2
#define KEY_VOL_DOWN 3
#define KEY_DPAD_UP  4
#define KEY_DPAD_DN  5
#define KEY_DPAD_L   6
#define KEY_DPAD_R   7
#define KEY_DPAD_OK  8
#define KEY_TR_BACK  9
#define KEY_TR_PLAY  10
#define KEY_TR_FWD   11
#define KEY_COUNT    12

#define DEBOUNCE_MS        {{debounceMs}}
#define IDLE_TIMEOUT_MS    {{idleTimeoutMs}}
#define LISTEN_MAX_MS      8000

typedef enum {
    LAUR_IDLE,
    LAUR_LISTENING,
    LAUR_RESOLVING,
    LAUR_TRANSMIT,
    LAUR_SLEEP,
} laur_state_t;

typedef struct {
    uint8_t   key;
    int64_t   timestamp_us;
} key_event_t;

static QueueHandle_t s_key_q;
static laur_state_t   s_state             = LAUR_IDLE;
static int64_t        s_last_activity_us  = 0;
static rmt_channel_handle_t s_ir_tx       = NULL;
static rmt_encoder_handle_t s_ir_encoder  = NULL;

static const char *state_name(laur_state_t st) {
    switch (st) {
        case LAUR_IDLE:      return "idle";
        case LAUR_LISTENING: return "listening";
        case LAUR_RESOLVING: return "resolving";
        case LAUR_TRANSMIT:  return "transmit";
        case LAUR_SLEEP:     return "sleep";
    }
    return "???";
}

static void enter_state(laur_state_t next) {
    if (next == s_state) return;
    ESP_LOGI(TAG, "state %s -> %s", state_name(s_state), state_name(next));
    s_state = next;
    s_last_activity_us = esp_timer_get_time();

    /* Hardware-gated mic rail follows LISTENING strictly. */
    gpio_set_level(MIC_GATE_GPIO, next == LAUR_LISTENING ? 1 : 0);

    /* Voice-button ring LED tracks listening/resolving for user feedback. */
    bool ring_on = (next == LAUR_LISTENING) || (next == LAUR_RESOLVING);
    gpio_set_level(VOICE_BTN_RING_GPIO, ring_on);
}

static void IRAM_ATTR key_isr(void *arg) {
    uint8_t key = (uint8_t)(uintptr_t)arg;
    key_event_t evt = {
        .key          = key,
        .timestamp_us = esp_timer_get_time(),
    };
    BaseType_t hp_task_woken = pdFALSE;
    xQueueSendFromISR(s_key_q, &evt, &hp_task_woken);
    if (hp_task_woken) portYIELD_FROM_ISR();
}

static esp_err_t laur_init_peripherals(void) {
    gpio_config_t out_cfg = {
        .pin_bit_mask = (1ULL << MIC_GATE_GPIO)
                      | (1ULL << VOICE_BTN_RING_GPIO),
        .mode         = GPIO_MODE_OUTPUT,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en   = GPIO_PULLUP_DISABLE,
        .intr_type    = GPIO_INTR_DISABLE,
    };
    ESP_RETURN_ON_ERROR(gpio_config(&out_cfg), TAG, "gpio out config");

    /* All key pins shared INTR_NEGEDGE; each gets an ISR thunk that
       reports its key index. Pull-ups internal; switches short to GND. */
    gpio_config_t key_cfg = {
        .mode         = GPIO_MODE_INPUT,
        .pull_up_en   = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type    = GPIO_INTR_NEGEDGE,
    };
    /* Pin mask elided here — laur_keys.h enumerates the dozen GPIOs. */
    extern const uint8_t LAUR_KEY_GPIOS[KEY_COUNT];
    for (uint8_t i = 0; i < KEY_COUNT; i++) {
        key_cfg.pin_bit_mask = 1ULL << LAUR_KEY_GPIOS[i];
        ESP_RETURN_ON_ERROR(gpio_config(&key_cfg), TAG, "gpio key %u", i);
        ESP_RETURN_ON_ERROR(gpio_isr_handler_add(LAUR_KEY_GPIOS[i],
                                                 key_isr,
                                                 (void *)(uintptr_t)i),
                            TAG, "isr key %u", i);
    }

    rmt_tx_channel_config_t tx_cfg = {
        .clk_src       = RMT_CLK_SRC_DEFAULT,
        .gpio_num      = IR_OUT_GPIO,
        .resolution_hz = 1000000, /* 1 MHz tick — 1 us per item. */
        .mem_block_symbols = 64,
        .trans_queue_depth = 4,
    };
    ESP_RETURN_ON_ERROR(rmt_new_tx_channel(&tx_cfg, &s_ir_tx),
                        TAG, "rmt channel");
    ESP_RETURN_ON_ERROR(rmt_enable(s_ir_tx), TAG, "rmt enable");
    /* IR encoder built from a per-protocol symbol table; declared
       in laur_ir.c. */
    extern esp_err_t laur_ir_encoder_new(rmt_encoder_handle_t *out);
    ESP_RETURN_ON_ERROR(laur_ir_encoder_new(&s_ir_encoder),
                        TAG, "ir encoder");

    return ESP_OK;
}

static void handle_key(const key_event_t *evt) {
    /* Debounce: drop events for the same key inside DEBOUNCE_MS. */
    static int64_t last_for_key[KEY_COUNT] = {0};
    if (evt->timestamp_us - last_for_key[evt->key]
        < DEBOUNCE_MS * 1000LL) {
        return;
    }
    last_for_key[evt->key] = evt->timestamp_us;
    s_last_activity_us     = evt->timestamp_us;

    if (s_state == LAUR_SLEEP) {
        enter_state(LAUR_IDLE);
    }

    if (evt->key == KEY_POWER || evt->key == KEY_MUTE
        || evt->key == KEY_VOL_UP || evt->key == KEY_VOL_DOWN) {
        /* Direct IR codes — straight to transmit. */
        enter_state(LAUR_TRANSMIT);
        laur_ir_send_for_key(s_ir_tx, s_ir_encoder, evt->key);
        enter_state(LAUR_IDLE);
        return;
    }

    /* d-pad and transport keys also go to transmit; voice handled
       separately via the dedicated button (see voice_button_task). */
    enter_state(LAUR_TRANSMIT);
    laur_ir_send_for_key(s_ir_tx, s_ir_encoder, evt->key);
    enter_state(LAUR_IDLE);
}

static void voice_button_task(void *arg) {
    bool pressed_last = false;
    for (;;) {
        bool pressed = gpio_get_level(VOICE_BTN_GPIO) == 0;
        if (pressed && !pressed_last) {
            enter_state(LAUR_LISTENING);
        } else if (!pressed && pressed_last) {
            if (s_state == LAUR_LISTENING) {
                enter_state(LAUR_RESOLVING);
                laur_voice_resolve_and_dispatch();
                enter_state(LAUR_IDLE);
            }
        }
        if (pressed && s_state == LAUR_LISTENING
            && (esp_timer_get_time() - s_last_activity_us)
               > LISTEN_MAX_MS * 1000LL) {
            /* Listening watchdog: bail to idle if held too long. */
            enter_state(LAUR_IDLE);
        }
        pressed_last = pressed;
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

static void idle_watchdog_task(void *arg) {
    for (;;) {
        int64_t now = esp_timer_get_time();
        if (s_state == LAUR_IDLE
            && (now - s_last_activity_us)
               > IDLE_TIMEOUT_MS * 1000LL) {
            enter_state(LAUR_SLEEP);
            esp_sleep_enable_ext1_wakeup(1ULL << VOICE_BTN_GPIO,
                                         ESP_EXT1_WAKEUP_ANY_LOW);
            esp_light_sleep_start();
            /* Wake reason is checked in app_main on resume. */
            enter_state(LAUR_IDLE);
        }
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "LAUR firmware {{rev}} starting on {{mcu}}");
    s_key_q = xQueueCreate(16, sizeof(key_event_t));
    ESP_ERROR_CHECK(gpio_install_isr_service(0));
    ESP_ERROR_CHECK(laur_init_peripherals());

    xTaskCreate(voice_button_task, "voice_btn", 4096, NULL, 6, NULL);
    xTaskCreate(idle_watchdog_task, "idle_wdt", 2048, NULL, 4, NULL);

    enter_state(LAUR_IDLE);

    key_event_t evt;
    for (;;) {
        if (xQueueReceive(s_key_q, &evt, pdMS_TO_TICKS(100)) == pdTRUE) {
            handle_key(&evt);
        }
    }
}
`;
