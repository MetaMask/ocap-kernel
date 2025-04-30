import { expect, describe, it, vi } from 'vitest';

import { makeFoo } from './makeFoo.ts';

const mocks = vi.hoisted(() => {
  const Foo = vi.fn();
  Foo.prototype.baz = vi.fn().mockResolvedValue('Hello fizz');
  return { Foo };
});

vi.mock('./foo.ts', () => ({
  Foo: mocks.Foo,
}));

describe('makeFoo', () => {
  it('should make a Foo', async () => {
    const foo = makeFoo('baz');
    expect(foo).toBeInstanceOf(mocks.Foo);
  });
});
