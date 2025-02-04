import '@ocap/shims/endoify';

import { Kernel } from '@ocap/kernel';
import {
  MessageChannel as NodeMessageChannel,
} from 'node:worker_threads';

import { makeKernel } from '../../kernel/make-kernel.js';
import { makeConfig } from './subclusterConfig.js';

import pullAndMakeModels from './models/pull-and-make.js';

const ollamaOnline = async () => {
  const response = await (await fetch('http://localhost:11434')).text();
  const expectation = 'Ollama is running';
  if (response !== expectation) {
    throw new Error('Ollama not running', { cause: response });
  }
}

main().catch(console.error);

/**
 * The main function for the demo.
 */
async function main() {
  await ollamaOnline();
  // await pullAndMakeModels();
  // We don't talk to the Kernel via a console (yet)
  const kernelPort = new NodeMessageChannel().port1;
  const kernel: Kernel = await makeKernel(kernelPort);
  const subclusterConfig = await makeConfig('deepseek-r1:1.5b');
  console.log('clusterConfig', JSON.stringify(subclusterConfig));
  await kernel.launchSubcluster(subclusterConfig);
}
