import type { ClusterConfig, VatConfig } from '@ocap/kernel';

type ModelSize = '1.5b' | '7b' | '8b' | '14b' | '32b' | '70b' | '671b';
type Model = `deepseek-r1:${ModelSize}${string}`;

const makeBundleSpec = (name: string): string =>
  `http://localhost:3000/${name}.bundle`;

type UserConfig = {
  model: Model;
  docs: { path: string; secrecy: number }[];
  trust: Record<string, number>;
  verbose?: boolean;
};

const makeUserConfig = (
  name: string,
  config: UserConfig,
): Record<string, VatConfig> => {
  const { model, docs, trust } = config;
  const verbose = config.verbose ?? false;
  return {
    // The vat representing this user agent.
    [name]: {
      bundleSpec: makeBundleSpec('user'),
      parameters: {
        name,
        verbose,
        trust,
      },
    },

    // The LLM vat with the special ollama vat power.
    [`${name}.llm`]: {
      bundleSpec: makeBundleSpec('llm'),
      parameters: { name, model, verbose },
    },
    // A mock wikipedia API which returns the content of a few wikipedia pages.
    [`${name}.vectorStore`]: {
      bundleSpec: makeBundleSpec('vectorStore'),
      parameters: {
        name,
        model: 'mxbai-embed-large',
        verbose,
        documents: docs ?? [],
      },
    },
  };
};

export const makeSubclusterConfig = (verbose: boolean): ClusterConfig => {
  const aliceConfig = makeUserConfig('alice', {
    // Alice smol brain
    model: 'deepseek-r1:1.5b',
    // Alice no know thing
    docs: [],
    trust: {
      // Alice trusts Bob thoroughly
      bob: 1,
      // Alice does not trust Eve
      eve: 0,
    },
    verbose,
  });
  const bobConfig = makeUserConfig('bob', {
    // Bob big brain
    model: 'deepseek-r1:7b-8k',
    // Bob know much
    docs: [
      { path: 'ambient-authority', secrecy: 0 },
      { path: 'confused-deputy-problem', secrecy: 0 },
      { path: 'consensys-ipo', secrecy: 0.6 },
    ],
    trust: {
      // Bob trusts Alice well
      alice: 0.7,
      // Bob does not trust Eve
      eve: 0,
    },
    verbose,
  });
  const eveConfig = makeUserConfig('eve', {
    // Eve big brain
    model: 'deepseek-r1:7b-8k',
    // Eve no know thing
    docs: [],
    trust: {
      // Eve is suspicious of Alice
      alice: 0.2,
      // Eve trusts Bob very well
      bob: 0.9,
    },
    verbose,
  });

  return {
    bootstrap: 'boot',
    vats: {
      boot: {
        bundleSpec: 'http://localhost:3000/boot.bundle',
        parameters: {
          users: ['alice', 'bob', 'eve'],
          verbose,
        },
      },
      ...aliceConfig,
      ...bobConfig,
      ...eveConfig,
    },
  };
};
