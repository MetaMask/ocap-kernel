import '@ocap/shims/endoify';

import { Kernel } from '@ocap/kernel';
import type { ClusterConfig } from '@ocap/kernel';
import { MessageChannel as NodeMessageChannel } from 'node:worker_threads';

import { makeUserConfig } from './subclusterConfig.js';
import { makeKernel } from '../../kernel/make-kernel.js';

const ollamaOnline = async () => {
  const response = await (await fetch('http://localhost:11434')).text();
  const expectation = 'Ollama is running';
  if (response !== expectation) {
    throw new Error('Ollama not running', { cause: response });
  }
};

main({ verbose: false }).catch(console.error);

/**
 * The main function for the demo.
 *
 * @param options0
 * @param options0.verbose
 */
async function main({ verbose }: { verbose: boolean }) {
  await ollamaOnline();
  // We don't talk to the Kernel via a console (yet)
  const kernelPort = new NodeMessageChannel().port1;
  const kernel: Kernel = await makeKernel(kernelPort);
  const aliceConfig = await makeUserConfig('alice', {
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
  const bobConfig = await makeUserConfig('bob', {
    // Bob big brain
    model: 'deepseek-r1:7b-8k',
    // Bob know much
    docs: [
      { path: 'ambient-authority.txt', secrecy: 0 },
      { path: 'confused-deputy-problem.txt', secrecy: 0 },
      { path: 'consensys-ipo.txt', secrecy: 0.6 },
    ],
    trust: {
      // Bob trusts Alice well
      alice: 0.7,
      // Bob does not trust Eve
      eve: 0,
    },
    verbose,
  });
  const eveConfig = await makeUserConfig('eve', {
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
  const subclusterConfig: ClusterConfig = {
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
  console.log('clusterConfig', JSON.stringify(subclusterConfig));
  await kernel.launchSubcluster(subclusterConfig);
}
