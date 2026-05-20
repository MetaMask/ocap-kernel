import { invocationToProvision } from '@metamask/kernel-utils/session';
import type {
  InvocationPattern,
  Provision,
} from '@metamask/kernel-utils/session';
import { describe, expect, it } from 'vitest';

import { buildRootObject } from './permission-tracker.ts';

// ─── helpers ──────────────────────────────────────────────────────────────────

const inv = (name: string, ...argv: string[]) => ({ name, argv });

const makeRoot = () => {
  const root = buildRootObject();
  root.bootstrap();
  return root;
};

const prefixPat = (name: string, pfx: string): InvocationPattern => ({
  name,
  argPatterns: [{ kind: 'prefix', prefix: pfx }],
});

const wildcardPat = (name: string): InvocationPattern => ({
  name,
  argPatterns: [{ kind: 'wildcard' }],
});

const prov = (tool: string, ...patterns: InvocationPattern[]): Provision => ({
  tool,
  patterns,
});

// ─── empty sheaf ──────────────────────────────────────────────────────────────

describe('empty tracker', () => {
  it('returns ask with no sections', async () => {
    const root = makeRoot();
    expect(await root.route('Bash', [inv('ls')])).toBe('ask');
  });

  it('has size 0', () => {
    expect(makeRoot().size()).toBe(0);
  });
});

// ─── size tracking ────────────────────────────────────────────────────────────

describe('size', () => {
  it('grows with each addSection', () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(root.size()).toBe(1);
    root.addSection(invocationToProvision('Bash', [inv('cat', '/etc/hosts')]));
    expect(root.size()).toBe(2);
  });
});

// ─── exact provisions ─────────────────────────────────────────────────────────

describe('exact provision', () => {
  it('allows an exact match', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('allow');
  });

  it('asks for a different tool', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(await root.route('Read', [inv('ls', '/tmp')])).toBe('ask');
  });

  it('asks for a different command name', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(await root.route('Bash', [inv('cat', '/tmp')])).toBe('ask');
  });

  it('asks when an argument differs', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(await root.route('Bash', [inv('ls', '/home')])).toBe('ask');
  });

  it('asks for a different invocation count', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    // provision has 1 pattern but we send 2 invocations
    expect(
      await root.route('Bash', [inv('ls', '/tmp'), inv('grep', 'foo')]),
    ).toBe('ask');
  });
});

// ─── prefix provisions ────────────────────────────────────────────────────────

describe('prefix provision', () => {
  it('allows invocations under the prefix', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', prefixPat('ls', '/tmp/')));
    expect(await root.route('Bash', [inv('ls', '/tmp/foo')])).toBe('allow');
    expect(await root.route('Bash', [inv('ls', '/tmp/a/b/c')])).toBe('allow');
  });

  it('asks for paths outside the prefix', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', prefixPat('ls', '/tmp/')));
    expect(await root.route('Bash', [inv('ls', '/home/user')])).toBe('ask');
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('ask'); // exact '/tmp' doesn't start with '/tmp/'
  });
});

// ─── wildcard provisions ──────────────────────────────────────────────────────

describe('wildcard provision', () => {
  it('allows any invocation with a first arg', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', wildcardPat('ls')));
    expect(await root.route('Bash', [inv('ls', '/any/path')])).toBe('allow');
    expect(await root.route('Bash', [inv('ls', '/other')])).toBe('allow');
  });

  it('provision with no argPatterns matches invocations of any arity', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', { name: 'ls', argPatterns: [] }));
    expect(await root.route('Bash', [inv('ls')])).toBe('allow');
    expect(await root.route('Bash', [inv('ls', '-la')])).toBe('allow');
  });

  it('still asks for a different tool', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', wildcardPat('ls')));
    expect(await root.route('Read', [inv('ls')])).toBe('ask');
  });

  it('asks for a different command name even with wildcard arg', async () => {
    const root = makeRoot();
    root.addSection(prov('Bash', wildcardPat('ls')));
    expect(await root.route('Bash', [inv('cat', '/tmp')])).toBe('ask');
  });
});

// ─── truncated-arg provisions ─────────────────────────────────────────────────

describe('truncated-arg provision (fewer patterns than argv)', () => {
  it('allows when the specified args match regardless of trailing args', async () => {
    const root = makeRoot();
    // pattern specifies only the first arg (command name only, any flags)
    root.addSection(
      prov('Bash', {
        name: 'ls',
        argPatterns: [{ kind: 'exact', value: '/tmp' }],
      }),
    );
    expect(
      await root.route('Bash', [inv('ls', '/tmp', '-la', '--color')]),
    ).toBe('allow');
  });
});

// ─── pipeline provisions (multi-command Bash) ─────────────────────────────────

describe('pipeline provisions', () => {
  it('allows a matching two-command pipeline', async () => {
    const root = makeRoot();
    root.addSection(
      invocationToProvision('Bash', [inv('ls', '/tmp'), inv('grep', 'foo')]),
    );
    expect(
      await root.route('Bash', [inv('ls', '/tmp'), inv('grep', 'foo')]),
    ).toBe('allow');
  });

  it('asks when pipeline has fewer commands than the provision', async () => {
    const root = makeRoot();
    root.addSection(
      invocationToProvision('Bash', [inv('ls', '/tmp'), inv('grep', 'foo')]),
    );
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('ask');
  });

  it('asks when pipeline has more commands than the provision', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(
      await root.route('Bash', [inv('ls', '/tmp'), inv('grep', 'foo')]),
    ).toBe('ask');
  });
});

// ─── non-Bash tools ───────────────────────────────────────────────────────────

describe('non-Bash tool (Read)', () => {
  it('allows a matching Read invocation', async () => {
    const root = makeRoot();
    root.addSection(
      invocationToProvision('Read', [inv('Read', '/tmp/foo.ts')]),
    );
    expect(await root.route('Read', [inv('Read', '/tmp/foo.ts')])).toBe(
      'allow',
    );
  });

  it('asks when the file path differs', async () => {
    const root = makeRoot();
    root.addSection(
      invocationToProvision('Read', [inv('Read', '/tmp/foo.ts')]),
    );
    expect(await root.route('Read', [inv('Read', '/tmp/bar.ts')])).toBe('ask');
  });
});

// ─── multiple provisions ──────────────────────────────────────────────────────

describe('multiple provisions', () => {
  it('allows an invocation that matches any added provision', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    root.addSection(invocationToProvision('Bash', [inv('cat', '/etc/hosts')]));
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('allow');
    expect(await root.route('Bash', [inv('cat', '/etc/hosts')])).toBe('allow');
  });

  it('narrow provision allows its match even when a wider provision also exists', async () => {
    const root = makeRoot();
    // wildcard provision added first, then narrow exact
    root.addSection(prov('Bash', wildcardPat('ls')));
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('allow');
  });

  it('falls through from narrow to wide when narrow does not match', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    root.addSection(prov('Bash', wildcardPat('ls')));
    // '/home' doesn't match exact '/tmp' but matches wildcard
    expect(await root.route('Bash', [inv('ls', '/home')])).toBe('allow');
  });

  it('asks when no provision matches', async () => {
    const root = makeRoot();
    root.addSection(invocationToProvision('Bash', [inv('ls', '/tmp')]));
    root.addSection(invocationToProvision('Bash', [inv('cat', '/etc/hosts')]));
    expect(await root.route('Bash', [inv('rm', '-rf', '/')])).toBe('ask');
  });

  it('adding the same provision twice still allows on match', async () => {
    const root = makeRoot();
    const provision = invocationToProvision('Bash', [inv('ls', '/tmp')]);
    root.addSection(provision);
    root.addSection(provision);
    expect(await root.route('Bash', [inv('ls', '/tmp')])).toBe('allow');
    expect(root.size()).toBe(2);
  });
});
