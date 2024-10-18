import '@ocap/shims/endoify';
import { hasProperty } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

/* eslint-disable vitest/expect-expect */

const singleUseGetter = (
  _: object,
  propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor => {
  const getter = descriptor.value;
  if (!getter) {
    throw new Error();
  }
  let didReturn: boolean = false;
  descriptor.value = () => {
    if (didReturn) {
      throw new Error(
        `Single use property ${String(propertyKey)} already accessed.`,
      );
    }
    didReturn = true;
    return getter();
  };
  return descriptor;
};

type Class<Props extends object> = new () => Props;

const runSuite = (
  Foo: Class<{ foo: number }>,
  Bar: Class<{ foo: number; bar: number }>,
): void => {
  const foo = new Foo();
  const bar = new Bar();

  expect(foo).toBeInstanceOf(Foo);
  expect(foo).not.toBeInstanceOf(Bar);
  expect(foo.foo).toBe(1);
  // @ts-expect-error bar should not be defined.
  expect(foo.bar).toBeUndefined();
  expect(bar).toBeInstanceOf(Foo);
  expect(bar).toBeInstanceOf(Bar);
  expect(bar.foo).toBe(1);
  expect(bar.bar).toBe(2);
};

describe('subclass', () => {
  it('with harden instance in super', () => {
    class Foo {
      foo: number = 1;

      @singleUseGetter
      getFoo(): number {
        return this.foo;
      }

      constructor() {
        // Hardening this instance in the constructor prevents the subclass
        // from setting 'bar'.
        harden(this);
      }
    }

    class Bar extends Foo {
      bar: number = 2;
    }

    runSuite(Foo, Bar);
  });

  it('passing prop setter to constructor, calling method in constructor', () => {
    class Foo {
      foo: number;

      @singleUseGetter
      getFoo(): number {
        return this.foo;
      }

      constructor(
        defineProps?: (
          getFoo: typeof this.getFoo,
        ) => Iterable<[string | symbol, unknown]>,
      ) {
        this.foo = 1;
        // We can pass a prop setter to the constructor,
        // but 'this' will be undefined in `getFoo` when called before the
        // constructor exits.
        if (defineProps) {
          const props = defineProps(this.getFoo.bind(this));
          for (const [name, value] of props) {
            Object.defineProperty(this, name, { value });
          }
        }
        harden(this);
      }
    }

    class Bar extends Foo {
      // @ts-expect-error bar _is_ set in the constructor
      bar: number;

      constructor() {
        super((getFoo) => [['bar', getFoo() + 1]]);
        assert(hasProperty(this, 'bar'));
      }
    }

    runSuite(Foo, Bar);
  });

  it('passing prop setter to constructor, calling #private method after constructor', () => {
    class Foo {
      foo: number;

      // We can't use a decorator on #private methods :/
      #didGetFoo: boolean = false;

      #getFoo(): number {
        if (this.#didGetFoo) {
          throw new Error('Single use property getFoo already accessed.');
        }
        this.#didGetFoo = true;
        return this.foo;
      }

      constructor(
        defineProps?: (
          getFoo: () => number,
        ) => Iterable<[string | symbol, unknown]>,
      ) {
        this.foo = 1;
        // We pass a prop setter to the constructor, exposing a #private
        // method to the subclass during construction; but we can't require
        // that the subclass doesn't expose that method on its own interface.
        if (defineProps) {
          const props = defineProps(this.#getFoo.bind(this));
          for (const [name, value] of props) {
            Object.defineProperty(this, name, { value });
          }
        }
        harden(this);
      }
    }

    class Bar extends Foo {
      readonly getFoo?: () => number;

      get bar(): number {
        return this.getFoo ? this.getFoo() + 1 : 0;
      }

      constructor() {
        super((getFoo) => [['getFoo', getFoo]]);
        assert(hasProperty(this, 'getFoo'));
      }
    }

    runSuite(Foo, Bar);
  });

  it('passing prop getter and setter to constructor, calling #private method after constructor', () => {
    class Foo {
      foo: number = 1;

      // We can't use a decorator on #private methods :/
      #didGetFoo: boolean = false;

      #getFoo(): number {
        if (this.#didGetFoo) {
          throw new Error('Single use property getFoo already accessed.');
        }
        this.#didGetFoo = true;
        return this.foo;
      }

      constructor(defineProps?: (getFoo: () => number) => void) {
        // We pass a prop setter to the constructor, knowing that
        // the subclass can only assign to its #private members. We still
        // can't prevent the subclass from exposing a getter which reads
        // from its private members.
        defineProps?.(this.#getFoo.bind(this));
        harden(this);
      }
    }

    type BarPrivProps = { getFoo: () => number };

    class Bar extends Foo {
      readonly #privProps: BarPrivProps = { getFoo: () => 0 };

      get bar(): number {
        return this.#privProps.getFoo() + 1;
      }

      constructor() {
        const privProps: Record<string | symbol, unknown> = {};
        super((getFoo) => {
          privProps.getFoo = getFoo;
        });
        // We _can_ set #private properties after harden.
        this.#privProps = privProps as BarPrivProps;
        assert(hasProperty(this.#privProps, 'getFoo'));
      }
    }

    runSuite(Foo, Bar);
  });
});

/* eslint-enable vitest/expect-expect */
