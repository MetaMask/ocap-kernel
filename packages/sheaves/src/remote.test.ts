import { GET_INTERFACE_GUARD } from '@endo/exo';
import { M } from '@endo/patterns';
import { describe, it, expect, vi } from 'vitest';

import { constant } from './metadata.ts';
import { makeRemoteSection } from './remote.ts';
import { makeHandler } from './section.ts';

// Mirrors the local-E pattern used throughout sheaf tests: the test
// environment has no HandledPromise, so we mock E as a transparent cast.
// With this mock, E(exo) === exo, so [GET_INTERFACE_GUARD] and method calls
// resolve locally against the handler — equivalent to a local CapTP loopback.
vi.mock('@endo/eventual-send', () => ({
  E: (ref: unknown) => ref,
}));

const makeRemoteHandler = (tag: string) =>
  makeHandler(
    tag,
    M.interface(
      tag,
      {
        greet: M.callWhen(M.string()).returns(M.string()),
        add: M.callWhen(M.number(), M.number()).returns(M.number()),
      },
      { defaultGuards: 'passable' },
    ),
    {
      greet: async (name: string) => `Hello, ${name}!`,
      add: async (a: number, b: number) => a + b,
    },
  );

describe('makeRemoteSection', () => {
  it('fetches the interface guard from the remote ref', async () => {
    const remoteHandler = makeRemoteHandler('Remote');
    const { handler } = await makeRemoteSection('Wrapper', remoteHandler);
    expect(handler[GET_INTERFACE_GUARD]?.()).toStrictEqual(
      remoteHandler[GET_INTERFACE_GUARD]?.(),
    );
  });

  it('forwards method calls to the remote ref', async () => {
    const greet = vi.fn(async (name: string) => `Hello, ${name}!`);
    const remoteHandler = makeHandler(
      'Remote',
      M.interface(
        'Remote',
        { greet: M.callWhen(M.string()).returns(M.string()) },
        { defaultGuards: 'passable' },
      ),
      { greet },
    );

    const { handler } = await makeRemoteSection('Wrapper', remoteHandler);
    const wrapper = handler as Record<
      string,
      (...a: unknown[]) => Promise<unknown>
    >;
    const result = await wrapper.greet('Alice');

    expect(greet).toHaveBeenCalledWith('Alice');
    expect(result).toBe('Hello, Alice!');
  });

  it('forwards all methods declared in the guard', async () => {
    const greet = vi.fn(async (_: string) => '');
    const add = vi.fn(async (a: number, b: number) => a + b);
    const remoteHandler = makeHandler(
      'Remote',
      M.interface(
        'Remote',
        {
          greet: M.callWhen(M.string()).returns(M.string()),
          add: M.callWhen(M.number(), M.number()).returns(M.number()),
        },
        { defaultGuards: 'passable' },
      ),
      { greet, add },
    );

    const { handler } = await makeRemoteSection('Wrapper', remoteHandler);
    const wrapper = handler as Record<
      string,
      (...a: unknown[]) => Promise<unknown>
    >;
    await wrapper.greet('x');
    await wrapper.add(2, 3);

    expect(greet).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(2, 3);
  });

  it('passes metadata through to the provider', async () => {
    const metadata = constant({ mode: 'remote' as const });
    const { metadata: actual } = await makeRemoteSection(
      'Wrapper',
      makeRemoteHandler('Remote'),
      metadata,
    );
    expect(actual).toBe(metadata);
  });

  it('metadata is undefined when not provided', async () => {
    const { metadata } = await makeRemoteSection(
      'Wrapper',
      makeRemoteHandler('Remote'),
    );
    expect(metadata).toBeUndefined();
  });
});
