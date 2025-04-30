import { Foo } from './foo.ts';

/**
 * Make a Foo
 *
 * @param bar - The bar to use for the Foo
 *
 * @returns A Foo
 */
export function makeFoo(bar: string): Foo {
  return new Foo(bar);
}
