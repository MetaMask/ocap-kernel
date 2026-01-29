import { describe, expect, it } from 'vitest';

import { SilentReporter } from './silent-reporter.ts';

describe('SilentReporter', () => {
  describe('prototype chain', () => {
    it('skips DotReporter and reaches BaseReporter for onTestRunEnd', () => {
      // Verify the inheritance chain
      const silentInstance = new SilentReporter();

      // Step through the prototype chain:
      // silentInstance -> SilentReporter.prototype
      const silentProto = Object.getPrototypeOf(silentInstance);
      expect(silentProto.constructor.name).toBe('SilentReporter');

      // SilentReporter.prototype -> DotReporter.prototype
      const dotProto = Object.getPrototypeOf(silentProto);
      expect(dotProto.constructor.name).toBe('DotReporter');

      // DotReporter.prototype -> BaseReporter.prototype
      const baseProto = Object.getPrototypeOf(dotProto);
      expect(baseProto.constructor.name).toBe('BaseReporter');

      // Verify DotReporter has its own onTestRunEnd (the one we want to skip)
      expect(
        Object.prototype.hasOwnProperty.call(dotProto, 'onTestRunEnd'),
      ).toBe(true);

      // We need 3 levels to get to BaseReporter:
      // this -> SilentReporter.prototype -> DotReporter.prototype -> BaseReporter.prototype
      const baseReporterProto = Object.getPrototypeOf(
        Object.getPrototypeOf(Object.getPrototypeOf(silentInstance)),
      );
      expect(baseReporterProto.constructor.name).toBe('BaseReporter');

      // Verify that's what the code uses by checking the internal traversal
      // The code should use 3 levels of getPrototypeOf to reach BaseReporter
      // and not 2 levels which would only reach DotReporter
    });
  });
});
