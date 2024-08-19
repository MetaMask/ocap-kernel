import { vi, beforeEach, describe, it, expect } from 'vitest';
// import '@ocap/shims/endoify';

describe('endoify', () => {
  describe('shimmed', () => {
    beforeEach(async () => {
      vi.resetModules();
      vi.importActual('@ocap/shims/endoify');
      //await import('@ocap/shims/endoify');
    });

    it('should include `ses` code', () => {
      // Due to `lockdown()`, and therefore `ses`
      expect(Object.isFrozen(Array.prototype)).toBeTruthy();
    });

    it('should include `eventual-send` code', () => {
      // Due to eventual send
      expect(typeof HandledPromise).not.toBe('undefined');
    });

  });

  describe('unshimmed', () => {
    beforeEach(async () => {
      vi.resetModules();
    });

    it('should not include `ses` code', () => {
      // Due to `lockdown()`, and therefore `ses`
      expect(Object.isFrozen(Array.prototype)).toBeFalsy();
    });

    it('should not include `eventual-send` code', () => {
      // Due to eventual send
      expect(typeof HandledPromise).toBe('undefined');
    });
  })

})
