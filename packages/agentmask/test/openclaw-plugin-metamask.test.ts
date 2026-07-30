import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaemonCaller } from '../openclaw-plugin-metamask/daemon.ts';
import pluginEntry from '../openclaw-plugin-metamask/index.ts';

const mockDaemonCaller: DaemonCaller = {
  redeemUrl: vi.fn(),
  queueMessage: vi.fn(),
  close: vi.fn(),
};

vi.mock('../openclaw-plugin-metamask/daemon.ts', () => ({
  makeDaemonCaller: () => mockDaemonCaller,
}));

type ToolResponse = {
  content: { type: 'text'; text: string }[];
};

type ToolDefinition = {
  name: string;
  execute: (
    id: string,
    params?: Record<string, string>,
  ) => Promise<ToolResponse>;
};

type PluginApi = {
  pluginConfig?: Record<string, unknown>;
  registerTool: (tool: ToolDefinition) => void;
};

const MOCK_SCHEMA = {
  getAccounts: {
    description: 'Get wallet accounts',
    args: {},
    returns: { type: 'array', description: 'List of addresses' },
  },
  signMessage: {
    description: 'Sign a personal message',
    args: {
      address: { type: 'string', description: 'Signer address' },
      message: { type: 'string', description: 'Message to sign' },
      chainId: { type: 'string', description: 'Hex chain ID' },
    },
    returns: { type: 'string', description: 'Signature' },
  },
};

/**
 * Register the metamask plugin and return registered tools by name.
 *
 * @param configOverrides - Optional config overrides.
 * @returns A map of tools.
 */
function setupPlugin(
  configOverrides?: Record<string, unknown>,
): Map<string, ToolDefinition> {
  const tools = new Map<string, ToolDefinition>();
  const api: PluginApi = {
    pluginConfig: {
      socketPath: '/tmp/test-jsonrpc.sock',
      ocapUrl: 'ocap:test123@12D3KooWtest,/ip4/127.0.0.1/tcp/9090',
      timeoutMs: 5000,
      ...configOverrides,
    },
    registerTool: (tool) => {
      tools.set(tool.name, tool);
    },
  };

  pluginEntry.register(api);
  return tools;
}

describe('openclaw metamask plugin', () => {
  const mockRedeemUrl = vi.mocked(mockDaemonCaller.redeemUrl);
  const mockQueueMessage = vi.mocked(mockDaemonCaller.queueMessage);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('plugin entry', () => {
    it('has correct id and name', () => {
      expect(pluginEntry.id).toBe('metamask');
      expect(pluginEntry.name).toBe('MetaMask (OCAP)');
    });

    it('registers four tools', () => {
      const tools = setupPlugin();
      expect([...tools.keys()]).toStrictEqual([
        'metamask_obtain_vendor',
        'metamask_request_capability',
        'metamask_call_capability',
        'metamask_list_capabilities',
      ]);
    });
  });

  describe('config schema', () => {
    it('accepts valid config', () => {
      const result = pluginEntry.configSchema.safeParse({
        socketPath: '/tmp/test.sock',
        ocapUrl: 'ocap:abc@peer',
        timeoutMs: 30000,
        resetState: true,
      });
      expect(result.success).toBe(true);
    });

    it('accepts undefined config', () => {
      const result = pluginEntry.configSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it('rejects unknown keys', () => {
      const result = pluginEntry.configSchema.safeParse({ badKey: true });
      expect(result.success).toBe(false);
    });

    it('rejects non-string ocapUrl', () => {
      const result = pluginEntry.configSchema.safeParse({ ocapUrl: 123 });
      expect(result.success).toBe(false);
    });

    it('rejects non-boolean resetState', () => {
      const result = pluginEntry.configSchema.safeParse({
        resetState: 'true',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-object config', () => {
      const result = pluginEntry.configSchema.safeParse('not an object');
      expect(result.success).toBe(false);
    });
  });

  describe('metamask_request_capability', () => {
    it('redeems URL, requests capability, and discovers methods', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      // requestCapability response — the vat has already substituted
      // the returned remotable for a bare ref string.
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      // __getDescription__ response
      mockQueueMessage.mockResolvedValueOnce(MOCK_SCHEMA);

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      const result = await tool.execute('id1', {
        request: 'sign personal messages',
      });

      const { text } = result.content[0];
      expect(text).toContain('cap:o5');
      expect(text).toContain('@@o5');
      expect(text).toContain('getAccounts');
      expect(text).toContain('signMessage');
      expect(text).toContain('Signer address');
      expect(text).toContain('Message to sign');

      expect(mockQueueMessage).toHaveBeenCalledTimes(2);
      expect(mockQueueMessage).toHaveBeenNthCalledWith(1, {
        target: '@@o10',
        method: 'requestCapability',
        args: ['sign personal messages'],
      });
      expect(mockQueueMessage).toHaveBeenNthCalledWith(2, {
        target: '@@o5',
        method: '__getDescription__',
        args: [],
      });
    });

    it('works when discovery fails gracefully', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      mockQueueMessage.mockRejectedValueOnce(new Error('not discoverable'));

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      const result = await tool.execute('id1', {
        request: 'sign messages',
      });

      expect(result.content[0].text).toContain('cap:o5');
      // No method listing, but no error either
      expect(result.content[0].text).not.toContain('Error');
    });

    it('reuses cached vendor ref on second request', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      mockQueueMessage.mockResolvedValueOnce(MOCK_SCHEMA);
      mockQueueMessage.mockResolvedValueOnce('@@o6');
      mockQueueMessage.mockResolvedValueOnce({});

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      await tool.execute('id1', { request: 'sign messages' });
      await tool.execute('id2', { request: 'send tokens' });

      expect(mockRedeemUrl).toHaveBeenCalledTimes(1);
      expect(mockQueueMessage).toHaveBeenCalledTimes(4);
    });

    it('returns error on redeem failure', async () => {
      mockRedeemUrl.mockRejectedValueOnce(new Error('connection refused'));

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      const result = await tool.execute('id1', {
        request: 'sign messages',
      });

      expect(result.content[0].text).toContain('Error:');
      expect(result.content[0].text).toContain('connection refused');
    });

    it('returns error prompting for obtain_vendor when no URL configured', async () => {
      const tools = setupPlugin({ ocapUrl: '' });
      const tool = tools.get('metamask_request_capability')!;
      const result = await tool.execute('id1', {
        request: 'sign messages',
      });

      expect(result.content[0].text).toContain('Not connected');
      expect(result.content[0].text).toContain('metamask_obtain_vendor');
      expect(mockRedeemUrl).not.toHaveBeenCalled();
    });
  });

  describe('metamask_obtain_vendor', () => {
    it('redeems URL and stores vendor ref', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');

      const tools = setupPlugin({ ocapUrl: '' });
      const tool = tools.get('metamask_obtain_vendor')!;
      const result = await tool.execute('id1', {
        url: 'ocap:fresh@12D3KooWnew,/ip4/1.2.3.4/tcp/9090',
      });

      expect(result.content[0].text).toContain('Obtained MetaMask');
      expect(result.content[0].text).toContain('@@o10');
      expect(mockRedeemUrl).toHaveBeenCalledWith(
        'ocap:fresh@12D3KooWnew,/ip4/1.2.3.4/tcp/9090',
      );
    });

    it('enables request_capability after obtaining vendor', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      mockQueueMessage.mockResolvedValueOnce(MOCK_SCHEMA);

      const tools = setupPlugin({ ocapUrl: '' });

      await tools
        .get('metamask_obtain_vendor')!
        .execute('id1', { url: 'ocap:abc@peer,/ip4/1.2.3.4/tcp/9090' });

      const result = await tools
        .get('metamask_request_capability')!
        .execute('id2', { request: 'sign messages' });

      expect(result.content[0].text).toContain('cap:o5');
      expect(mockRedeemUrl).toHaveBeenCalledTimes(1);
    });

    it('returns error on redeem failure', async () => {
      mockRedeemUrl.mockRejectedValueOnce(new Error('invalid URL'));

      const tools = setupPlugin({ ocapUrl: '' });
      const tool = tools.get('metamask_obtain_vendor')!;
      const result = await tool.execute('id1', { url: 'bad-url' });

      expect(result.content[0].text).toContain('Error:');
      expect(result.content[0].text).toContain('invalid URL');
    });

    it('returns error for empty URL', async () => {
      const tools = setupPlugin({ ocapUrl: '' });
      const tool = tools.get('metamask_obtain_vendor')!;
      const result = await tool.execute('id1', { url: '  ' });

      expect(result.content[0].text).toContain('Error:');
      expect(result.content[0].text).toContain('empty');
      expect(mockRedeemUrl).not.toHaveBeenCalled();
    });
  });

  describe('metamask_call_capability', () => {
    /**
     * Set up the plugin with a pre-obtained capability.
     *
     * @returns The tools map.
     */
    async function setupWithCapability(): Promise<Map<string, ToolDefinition>> {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      mockQueueMessage.mockResolvedValueOnce(MOCK_SCHEMA);

      const tools = setupPlugin();
      await tools.get('metamask_request_capability')!.execute('id1', {
        request: 'sign messages',
      });
      mockRedeemUrl.mockClear();
      mockQueueMessage.mockClear();

      return tools;
    }

    it('calls method on capability by name', async () => {
      const tools = await setupWithCapability();

      mockQueueMessage.mockResolvedValueOnce(['0xabc123']);

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'cap:o5',
        method: 'getAccounts',
      });

      expect(result.content[0].text).toContain('0xabc123');
      expect(mockQueueMessage).toHaveBeenCalledWith({
        target: '@@o5',
        method: 'getAccounts',
        args: [],
      });
    });

    it('calls method on capability by ref', async () => {
      const tools = await setupWithCapability();

      mockQueueMessage.mockResolvedValueOnce('0xsig...');

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: '@@o5',
        method: 'signMessage',
        args: '["0xabc", "hello", "0x1"]',
      });

      expect(result.content[0].text).toContain('0xsig...');
      expect(mockQueueMessage).toHaveBeenCalledWith({
        target: '@@o5',
        method: 'signMessage',
        args: ['0xabc', 'hello', '0x1'],
      });
    });

    it('returns error for unknown capability name', async () => {
      const tools = await setupWithCapability();

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'NonExistent',
        method: 'doSomething',
      });

      expect(result.content[0].text).toContain('Error:');
      expect(result.content[0].text).toContain('Unknown capability');
      expect(result.content[0].text).toContain('cap:o5');
    });

    it('returns error for invalid args JSON', async () => {
      const tools = await setupWithCapability();

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'cap:o5',
        method: 'getAccounts',
        args: 'not-json',
      });

      expect(result.content[0].text).toContain('Error:');
    });

    it('returns error when args is not an array', async () => {
      const tools = await setupWithCapability();

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'cap:o5',
        method: 'getAccounts',
        args: '{"not": "array"}',
      });

      expect(result.content[0].text).toContain('Error:');
      expect(result.content[0].text).toContain('args must be a JSON array');
    });
  });

  describe('metamask_list_capabilities', () => {
    it('returns empty message when no capabilities', async () => {
      const tools = setupPlugin();
      const tool = tools.get('metamask_list_capabilities')!;
      const result = await tool.execute('id1');

      expect(result.content[0].text).toContain('No capabilities obtained');
      expect(result.content[0].text).toContain('metamask_request_capability');
    });

    it('lists obtained capabilities with methods', async () => {
      mockRedeemUrl.mockResolvedValueOnce('@@o10');
      mockQueueMessage.mockResolvedValueOnce('@@o5');
      mockQueueMessage.mockResolvedValueOnce(MOCK_SCHEMA);

      const tools = setupPlugin();
      await tools.get('metamask_request_capability')!.execute('id1', {
        request: 'sign messages',
      });

      const tool = tools.get('metamask_list_capabilities')!;
      const result = await tool.execute('id2');

      expect(result.content[0].text).toContain('Capabilities (1)');
      expect(result.content[0].text).toContain('cap:o5');
      expect(result.content[0].text).toContain('@@o5');
      expect(result.content[0].text).toContain('getAccounts, signMessage');
    });
  });
});
