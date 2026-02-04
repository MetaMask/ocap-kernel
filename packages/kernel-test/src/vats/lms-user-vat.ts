import { E } from '@endo/eventual-send';
import { makeDefaultExo } from '@metamask/kernel-utils/exo';
import { makeEventualIterator } from '@ocap/remote-iterables';

import { unwrapTestLogger } from '../test-powers.ts';
import type { TestPowers } from '../test-powers.ts';

/**
 * A vat that uses a language model service to generate text.
 *
 * @param vatPowers - The powers of the vat.
 * @param vatPowers.logger - The logger of the vat.
 * @param parameters - The parameters of the vat.
 * @param parameters.name - The name of the vat.
 * @returns A default Exo instance.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildRootObject(
  vatPowers: TestPowers,
  { name = 'anonymous' }: { name?: string } = {},
) {
  const tlog = unwrapTestLogger(vatPowers, name);
  let languageModel: unknown;
  const root = makeDefaultExo('root', {
    async bootstrap(
      { languageModelService }: { languageModelService: unknown },
      _kernelServices: unknown,
    ) {
      languageModel = await E(languageModelService).makeInstance({
        model: 'test',
      });
      await E(languageModel).push(`My name is ${name}.`);
      const response = await E(root).ask('Hello, what is your name?');
      tlog(`response: ${response}`);
    },
    async ask(prompt: string) {
      let response = '';
      const sampleResult = await E(languageModel).sample(prompt);
      const stream = await E(sampleResult).getStream();
      const iterator = makeEventualIterator(stream);
      for await (const chunk of iterator) {
        response += (chunk as { response: string }).response;
      }
      return response;
    },
  });

  return root;
}
