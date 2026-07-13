import { describe, it, expect } from 'vitest';

import { makeChannelFactory } from './channel-factory.ts';

const makeMockKernel = () => {
  const services = new Map<
    string,
    { name: string; kref: string; service: object; systemOnly: boolean }
  >();
  let krefCounter = 1;

  return {
    registerKernelServiceObject(name: string, service: object) {
      const kref = `ko${krefCounter}`;
      krefCounter += 1;
      const entry = { name, kref, service, systemOnly: false };
      services.set(name, entry);
      return entry;
    },
    async issueOcapURL(kref: string): Promise<string> {
      return Promise.resolve(`ocap:${kref}@mock`);
    },
    hasService(name: string) {
      return services.has(name);
    },
  };
};

describe('makeChannelFactory', () => {
  it('createChannel registers a channel service and returns an ocap URL', async () => {
    const kernel = makeMockKernel();
    const { channelFactory } = makeChannelFactory(kernel);

    const url = await channelFactory.createChannel();

    expect(url).toBe('ocap:ko1@mock');
    expect(kernel.hasService('channel:0')).toBe(true);
  });

  it('each createChannel call registers a distinct channel', async () => {
    const kernel = makeMockKernel();
    const { channelFactory } = makeChannelFactory(kernel);

    const url1 = await channelFactory.createChannel();
    const url2 = await channelFactory.createChannel();

    expect(url1).not.toBe(url2);
    expect(kernel.hasService('channel:0')).toBe(true);
    expect(kernel.hasService('channel:1')).toBe(true);
  });
});
