import { delay, makePromiseKitMock } from '@ocap/test-utils';
import { vi, describe, it } from 'vitest';
import { Foo } from './harden';

vi.mock('@endo/promise-kit', () => makePromiseKitMock());

describe('harden', () => {
  it('exists and can be called', ({ expect }) => {
    const obj = { foo: 'Foo', bar: 0x13412 }
    expect(harden(obj)).toMatchObject(obj);
  });

  it('with delay', async ({ expect }) => {
    await delay(10);
    expect(true).toBe(true);
  });

  it('imports a hardened class', ({ expect }) => {
    const foo = new Foo();
    expect(foo.foo()).toBe('foo');
  })
});
