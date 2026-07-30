import { describe, expect, it, vi } from 'vitest';

import {
  createState,
  ensureVendor,
  isRef,
  resolveCapability,
} from '../openclaw-plugin-metamask/state.ts';

describe('isRef', () => {
  it.each([
    ['@@o0', true],
    ['@@o5', true],
    ['@@o123', true],
    ['@@ko5', true],
    ['PersonalMessageSigner', false],
    ['@@', false],
    ['@@o5extra@extra', false],
    ['ko5', false],
    ['', false],
  ])('isRef(%j) returns %j', (input, expected) => {
    expect(isRef(input)).toBe(expected);
  });
});

describe('resolveCapability', () => {
  it('resolves a direct ref', () => {
    const state = createState();
    expect(resolveCapability('@@o5', state)).toBe('@@o5');
  });

  it('resolves a capability by name', () => {
    const state = createState();
    state.capabilities.set('cap:o5', {
      ref: '@@o5',
      name: 'cap:o5',
      description: 'sign messages',
      methods: undefined,
    });
    expect(resolveCapability('cap:o5', state)).toBe('@@o5');
  });

  it('throws for unknown name with hint', () => {
    const state = createState();
    state.capabilities.set('cap:o5', {
      ref: '@@o5',
      name: 'cap:o5',
      description: 'sign',
      methods: undefined,
    });
    expect(() => resolveCapability('Unknown', state)).toThrow(
      /Unknown capability.*cap:o5/u,
    );
  });

  it('throws for unknown name with no capabilities hint', () => {
    const state = createState();
    expect(() => resolveCapability('Unknown', state)).toThrow(
      /No capabilities obtained/u,
    );
  });
});

describe('ensureVendor', () => {
  it('throws prompting for metamask_obtain_vendor when no URL set', async () => {
    const state = createState();
    const daemon = {
      redeemUrl: vi.fn(),
      queueMessage: vi.fn(),
      close: vi.fn(),
    };
    await expect(ensureVendor({ state, daemon })).rejects.toThrow(
      /metamask_obtain_vendor/u,
    );
    expect(daemon.redeemUrl).not.toHaveBeenCalled();
  });
});
