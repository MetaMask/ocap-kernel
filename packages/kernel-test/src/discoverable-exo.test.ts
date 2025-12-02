import '@ocap/repo-tools/test-utils/mock-endoify';

import { makeSQLKernelDatabase } from '@metamask/kernel-store/sqlite/nodejs';
import { waitUntilQuiescent } from '@metamask/kernel-utils';
import { Logger, consoleTransport } from '@metamask/logger';
import { Kernel, kunser } from '@metamask/ocap-kernel';
import type { ClusterConfig } from '@metamask/ocap-kernel';
import type { CapabilityRecord } from '@ocap/kernel-agents';
import { makeJsonAgent } from '@ocap/kernel-agents/json';
import { OllamaNodejsService } from '@ocap/kernel-language-model-service/ollama/nodejs';
import { fetchMock } from '@ocap/repo-tools/test-utils/fetch-mock';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Import from source files since they're not exported

import { getBundleSpec, makeKernel, runTestVats } from './utils.ts';
import { capability } from '../../kernel-agents/src/capabilities/capability.ts';
import { DEFAULT_MODEL } from '../../kernel-agents/test/constants.ts';

const logger = new Logger({
  tags: ['test'],
  transports: [consoleTransport],
});

describe('discoverable exo capabilities', () => {
  let kernel: Kernel;
  let calculatorRef: string;

  beforeAll(() => {
    fetchMock.disableMocks();
  });

  afterAll(() => {
    fetchMock.enableMocks();
  });

  beforeEach(async () => {
    const kernelDatabase = await makeSQLKernelDatabase({
      dbFilename: ':memory:',
    });
    kernel = await makeKernel(kernelDatabase, true, logger);

    const testSubcluster: ClusterConfig = {
      bootstrap: 'discoverableTest',
      forceReset: true,
      vats: {
        discoverableTest: {
          bundleSpec: getBundleSpec('discoverable-capability-vat'),
          parameters: {},
        },
      },
    };

    await runTestVats(kernel, testSubcluster);
    await waitUntilQuiescent(100);

    // The first vat root object is ko3 due to kernel service objects
    const vatRootRef = 'ko3';
    const calculatorResult = await kernel.queueMessage(
      vatRootRef,
      'getCalculator',
      [],
    );
    // Exo objects are returned in the slots array
    calculatorRef = calculatorResult.slots[0] as string;
  });

  it('converts discoverable exo methods to agent capabilities', async () => {
    // Get the schema from the discoverable exo
    const describeResult = await kernel.queueMessage(
      calculatorRef,
      'describe',
      [],
    );
    const schema = kunser(describeResult) as Record<
      string,
      {
        description: string;
        args: Record<string, { type: string; description: string }>;
        returns?: { type: string; description: string };
      }
    >;

    // Convert each method to a capability
    // For methods with multiple args, we need to extract them from the args object
    const capabilities: CapabilityRecord = Object.fromEntries(
      Object.entries(schema).map(([methodName, methodSchema]) => {
        const argNames = Object.keys(methodSchema.args);
        return [
          methodName,
          capability(
            async (args: Record<string, unknown>) => {
              // Extract arguments in the order they appear in the schema
              const methodArgs = argNames.map((argName) => args[argName]);
              const result = await kernel.queueMessage(
                calculatorRef,
                methodName,
                methodArgs,
              );
              return kunser(result);
            },
            {
              description: methodSchema.description,
              args: Object.fromEntries(
                Object.entries(methodSchema.args).map(
                  ([argName, argSchema]) => [
                    argName,
                    {
                      type: argSchema.type as 'string' | 'number' | 'boolean',
                      description: argSchema.description,
                    },
                  ],
                ),
              ),
              ...(methodSchema.returns
                ? {
                    returns: {
                      type: methodSchema.returns.type as
                        | 'string'
                        | 'number'
                        | 'boolean',
                      description: methodSchema.returns.description,
                    },
                  }
                : {}),
            },
          ),
        ];
      }),
    );

    // Create agent with the capabilities
    const languageModelService = new OllamaNodejsService({
      endowments: { fetch },
    });
    const languageModel = await languageModelService.makeInstance({
      model: DEFAULT_MODEL,
    });
    const agent = makeJsonAgent({
      languageModel,
      capabilities,
      logger,
    });

    // Test that the agent can use the capabilities
    const result = await agent.task(
      'Add 5 and 3, then multiply the result by 2',
      undefined,
      { invocationBudget: 5 },
    );

    expect(result).toBeDefined();
    // The result should be (5 + 3) * 2 = 16
    expect(String(result)).toContain('16');
  });

  it('can discover schema from discoverable exo', async () => {
    // Get the full schema
    const describeResult = await kernel.queueMessage(
      calculatorRef,
      'describe',
      [],
    );
    const fullSchema = kunser(describeResult);

    expect(fullSchema).toBeDefined();
    expect(fullSchema).toHaveProperty('add');
    expect(fullSchema).toHaveProperty('multiply');
    expect(fullSchema).toHaveProperty('greet');

    // Get partial schema for specific methods
    const partialResult = await kernel.queueMessage(calculatorRef, 'describe', [
      'add',
      'multiply',
    ]);
    const partialSchema = kunser(partialResult);

    expect(partialSchema).toHaveProperty('add');
    expect(partialSchema).toHaveProperty('multiply');
    expect(partialSchema).not.toHaveProperty('greet');
  });

  it('can invoke discoverable exo methods directly', async () => {
    // Test direct method invocation
    const addResult = await kernel.queueMessage(calculatorRef, 'add', [5, 3]);
    const sum = kunser(addResult);
    expect(sum).toBe(8);

    const multiplyResult = await kernel.queueMessage(
      calculatorRef,
      'multiply',
      [4, 7],
    );
    const product = kunser(multiplyResult);
    expect(product).toBe(28);

    const greetResult = await kernel.queueMessage(calculatorRef, 'greet', [
      'Alice',
    ]);
    const greeting = kunser(greetResult);
    expect(greeting).toBe('Hello, Alice!');
  });
});
