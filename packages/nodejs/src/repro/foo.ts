export class Foo {
  readonly #bar: string;

  constructor(bar: string) {
    this.#bar = bar;
  }

  async baz(): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return `Hello ${this.#bar}`;
  }
}
