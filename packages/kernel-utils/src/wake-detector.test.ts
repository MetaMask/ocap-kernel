import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  detectCrossIncarnationWake,
  DEFAULT_CROSS_INCARNATION_WAKE_THRESHOLD_MS,
  installWakeDetector,
} from './wake-detector.ts';

describe('detectCrossIncarnationWake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns true when gap exceeds default threshold', () => {
    const twoHoursAgo =
      Date.now() - 2 * DEFAULT_CROSS_INCARNATION_WAKE_THRESHOLD_MS;
    expect(detectCrossIncarnationWake(twoHoursAgo)).toBe(true);
  });

  it('returns false when gap is within default threshold', () => {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1_000;
    expect(detectCrossIncarnationWake(tenMinutesAgo)).toBe(false);
  });

  it('returns false when lastShutdownTimestamp is undefined', () => {
    expect(detectCrossIncarnationWake(undefined)).toBe(false);
  });

  it('returns false when timestamp is very recent', () => {
    expect(detectCrossIncarnationWake(Date.now())).toBe(false);
  });

  it('supports a custom threshold', () => {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1_000;
    const oneMinuteThreshold = 60 * 1_000;
    expect(detectCrossIncarnationWake(fiveMinutesAgo, oneMinuteThreshold)).toBe(
      true,
    );
  });

  it('returns false when gap equals the threshold exactly', () => {
    const exactlyAtThreshold =
      Date.now() - DEFAULT_CROSS_INCARNATION_WAKE_THRESHOLD_MS;
    expect(detectCrossIncarnationWake(exactlyAtThreshold)).toBe(false);
  });
});

describe('installWakeDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls onWake when clock jumps beyond threshold', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake);

    // Advance time normally (15 seconds = interval)
    vi.advanceTimersByTime(15_000);
    expect(onWake).not.toHaveBeenCalled();

    // Simulate clock jump (system was asleep for 1 minute)
    const now = Date.now();
    vi.setSystemTime(now + 60_000); // Jump forward 60 seconds

    // Trigger the next interval check
    vi.advanceTimersByTime(15_000);

    expect(onWake).toHaveBeenCalledOnce();

    cleanup();
  });

  it('does not call onWake for normal time passage', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake);

    // Advance time normally through multiple intervals
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(15_000);
    }

    expect(onWake).not.toHaveBeenCalled();

    cleanup();
  });

  it('detects wake with custom intervalMs and jumpThreshold', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake, {
      intervalMs: 5_000, // Check every 5 seconds
      jumpThreshold: 10_000, // 10 second threshold
    });

    // Normal advance (5 seconds)
    vi.advanceTimersByTime(5_000);
    expect(onWake).not.toHaveBeenCalled();

    // Jump below threshold (12 seconds total)
    const now = Date.now();
    vi.setSystemTime(now + 7_000); // Only 7 second jump
    vi.advanceTimersByTime(5_000);
    expect(onWake).not.toHaveBeenCalled();

    // Jump above threshold (20 seconds total)
    const now2 = Date.now();
    vi.setSystemTime(now2 + 20_000); // 20 second jump
    vi.advanceTimersByTime(5_000);
    expect(onWake).toHaveBeenCalledOnce();

    cleanup();
  });

  it('calls onWake multiple times for multiple wake events', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake);

    // First wake event
    const now1 = Date.now();
    vi.setSystemTime(now1 + 60_000);
    vi.advanceTimersByTime(15_000);
    expect(onWake).toHaveBeenCalledTimes(1);

    // Normal time passage
    vi.advanceTimersByTime(15_000);
    expect(onWake).toHaveBeenCalledTimes(1);

    // Second wake event
    const now2 = Date.now();
    vi.setSystemTime(now2 + 60_000);
    vi.advanceTimersByTime(15_000);
    expect(onWake).toHaveBeenCalledTimes(2);

    cleanup();
  });

  it('cleanup function stops the detector', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake);

    // Cleanup immediately
    cleanup();

    // Simulate wake event
    const now = Date.now();
    vi.setSystemTime(now + 60_000);
    vi.advanceTimersByTime(15_000);

    // Should not be called after cleanup
    expect(onWake).not.toHaveBeenCalled();
  });

  it('cleanup function can be called multiple times safely', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake);

    cleanup();
    cleanup();
    cleanup();

    // Should not throw
    expect(onWake).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'very short interval and threshold',
      options: { intervalMs: 1_000, jumpThreshold: 2_000 },
      normalAdvance: 1_000,
      wakeJump: 5_000,
    },
    {
      name: 'very long interval and threshold',
      options: { intervalMs: 60_000, jumpThreshold: 120_000 },
      normalAdvance: 60_000,
      wakeJump: 200_000,
    },
    {
      name: 'default values',
      options: {},
      normalAdvance: 15_000,
      wakeJump: 60_000,
    },
  ])('works with $name', ({ options, normalAdvance, wakeJump }) => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake, options);

    // Normal advance shouldn't trigger
    vi.advanceTimersByTime(normalAdvance);
    expect(onWake).not.toHaveBeenCalled();

    // Large jump should trigger
    const now = Date.now();
    vi.setSystemTime(now + wakeJump);
    vi.advanceTimersByTime(normalAdvance);
    expect(onWake).toHaveBeenCalledOnce();

    cleanup();
  });

  it('only triggers when jump exceeds intervalMs + jumpThreshold', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake, {
      intervalMs: 10_000,
      jumpThreshold: 20_000,
    });

    // First normal interval to establish baseline
    vi.advanceTimersByTime(10_000);
    expect(onWake).not.toHaveBeenCalled();

    // Small jump (15 seconds total) - below threshold
    vi.advanceTimersByTime(15_000);
    expect(onWake).not.toHaveBeenCalled();

    // Large jump (50 seconds) - above threshold
    const now = Date.now();
    vi.setSystemTime(now + 50_000);
    vi.advanceTimersByTime(10_000);

    // Should trigger
    expect(onWake).toHaveBeenCalledOnce();

    cleanup();
  });

  it('updates last timestamp on each interval check', () => {
    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake, {
      intervalMs: 5_000,
      jumpThreshold: 10_000,
    });

    // First interval - no wake
    vi.advanceTimersByTime(5_000);
    expect(onWake).not.toHaveBeenCalled();

    // Second interval - still no wake
    vi.advanceTimersByTime(5_000);
    expect(onWake).not.toHaveBeenCalled();

    // Now jump forward from current position
    // This should only be 20 seconds from the last check, not from start
    const now = Date.now();
    vi.setSystemTime(now + 20_000);
    vi.advanceTimersByTime(5_000);

    // Should trigger (20 > 15 threshold)
    expect(onWake).toHaveBeenCalledOnce();

    cleanup();
  });

  it('works in real-time environment', async () => {
    vi.useRealTimers();

    const onWake = vi.fn();
    const cleanup = installWakeDetector(onWake, {
      intervalMs: 50, // Very short for testing
      jumpThreshold: 100,
    });

    // Wait for normal interval
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(onWake).not.toHaveBeenCalled();

    cleanup();

    // No wake event should have been detected in real time
    expect(onWake).not.toHaveBeenCalled();
  });
});
