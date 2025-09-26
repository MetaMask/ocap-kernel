import { describe, it, expect } from 'vitest';

import { makeDummyMeterControl } from './meter-control.ts';

describe('meter-control', () => {
  describe('makeDummyMeterControl', () => {
    it('creates a meter control object with expected methods', () => {
      const meterControl = makeDummyMeterControl();

      expect(meterControl).toHaveProperty('isMeteringDisabled');
      expect(meterControl).toHaveProperty('assertIsMetered');
      expect(meterControl).toHaveProperty('assertNotMetered');
      expect(meterControl).toHaveProperty('runWithoutMetering');
      expect(meterControl).toHaveProperty('runWithoutMeteringAsync');
      expect(meterControl).toHaveProperty('unmetered');
    });

    it('starts with metering enabled', () => {
      const meterControl = makeDummyMeterControl();
      expect(meterControl.isMeteringDisabled()).toBe(false);
    });

    describe('assertIsMetered', () => {
      it('succeeds when metering is enabled', () => {
        const meterControl = makeDummyMeterControl();
        expect(() => meterControl.assertIsMetered('test')).not.toThrow();
      });

      it('throws when metering is disabled', () => {
        const meterControl = makeDummyMeterControl();
        meterControl.runWithoutMetering(() => {
          expect(() => meterControl.assertIsMetered('test message')).toThrow(
            'test message',
          );
        });
      });
    });

    describe('assertNotMetered', () => {
      it('succeeds when metering is disabled', () => {
        const meterControl = makeDummyMeterControl();
        meterControl.runWithoutMetering(() => {
          expect(() => meterControl.assertNotMetered('test')).not.toThrow();
        });
      });

      it('throws when metering is enabled', () => {
        const meterControl = makeDummyMeterControl();
        expect(() => meterControl.assertNotMetered('test message')).toThrow(
          'test message',
        );
      });
    });

    describe('runWithoutMetering', () => {
      it('disables metering during execution', () => {
        const meterControl = makeDummyMeterControl();

        meterControl.runWithoutMetering(() => {
          expect(meterControl.isMeteringDisabled()).toBe(true);
        });
      });

      it('restores metering after execution', () => {
        const meterControl = makeDummyMeterControl();

        meterControl.runWithoutMetering(() => {
          // do nothing
        });
        expect(meterControl.isMeteringDisabled()).toBe(false);
      });

      it('restores metering even if thunk throws', () => {
        const meterControl = makeDummyMeterControl();

        expect(() =>
          meterControl.runWithoutMetering(() => {
            throw new Error('test error');
          }),
        ).toThrow('test error');

        expect(meterControl.isMeteringDisabled()).toBe(false);
      });

      it('returns thunk result', () => {
        const meterControl = makeDummyMeterControl();
        const result = meterControl.runWithoutMetering(() => 'test result');
        expect(result).toBe('test result');
      });

      it('supports nested calls', () => {
        const meterControl = makeDummyMeterControl();

        meterControl.runWithoutMetering(() => {
          expect(meterControl.isMeteringDisabled()).toBe(true);

          meterControl.runWithoutMetering(() => {
            expect(meterControl.isMeteringDisabled()).toBe(true);
          });

          expect(meterControl.isMeteringDisabled()).toBe(true);
        });

        expect(meterControl.isMeteringDisabled()).toBe(false);
      });
    });

    describe('runWithoutMeteringAsync', () => {
      it('disables metering during execution', async () => {
        const meterControl = makeDummyMeterControl();

        await meterControl.runWithoutMeteringAsync(async () => {
          expect(meterControl.isMeteringDisabled()).toBe(true);
        });
      });

      it('restores metering after execution', async () => {
        const meterControl = makeDummyMeterControl();

        await meterControl.runWithoutMeteringAsync(async () => {
          // do nothing
        });
        expect(meterControl.isMeteringDisabled()).toBe(false);
      });

      it('restores metering even if thunk rejects', async () => {
        const meterControl = makeDummyMeterControl();

        await expect(
          meterControl.runWithoutMeteringAsync(async () => {
            throw new Error('test error');
          }),
        ).rejects.toThrow('test error');

        expect(meterControl.isMeteringDisabled()).toBe(false);
      });

      it('returns thunk result', async () => {
        const meterControl = makeDummyMeterControl();
        const result = await meterControl.runWithoutMeteringAsync(
          async () => 'test result',
        );
        expect(result).toBe('test result');
      });

      it('supports nested calls', async () => {
        const meterControl = makeDummyMeterControl();

        await meterControl.runWithoutMeteringAsync(async () => {
          expect(meterControl.isMeteringDisabled()).toBe(true);

          await meterControl.runWithoutMeteringAsync(async () => {
            expect(meterControl.isMeteringDisabled()).toBe(true);
          });

          expect(meterControl.isMeteringDisabled()).toBe(true);
        });

        expect(meterControl.isMeteringDisabled()).toBe(false);
      });
    });

    describe('unmetered', () => {
      it('wraps function to run without metering', () => {
        const meterControl = makeDummyMeterControl();
        const fn = meterControl.unmetered(() => {
          expect(meterControl.isMeteringDisabled()).toBe(true);
          return 'test result';
        });

        expect(meterControl.isMeteringDisabled()).toBe(false);
        const result = fn();
        expect(result).toBe('test result');
        expect(meterControl.isMeteringDisabled()).toBe(false);
      });

      it('preserves function arguments', () => {
        const meterControl = makeDummyMeterControl();
        const fn = meterControl.unmetered((a: number, b: string) => {
          expect(meterControl.isMeteringDisabled()).toBe(true);
          return `${a}-${b}`;
        });

        const result = fn(42, 'test');
        expect(result).toBe('42-test');
      });

      it('restores metering if function throws', () => {
        const meterControl = makeDummyMeterControl();
        const fn = meterControl.unmetered(() => {
          throw new Error('test error');
        });

        expect(() => fn()).toThrow('test error');
        expect(meterControl.isMeteringDisabled()).toBe(false);
      });
    });
  });
});
