import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DaemonCaller } from '../openclaw-plugin-metamask/daemon.ts';
import pluginEntry from '../openclaw-plugin-metamask/index.ts';

const mockDaemonCaller: DaemonCaller = {
  redeemUrl: vi.fn(),
  queueMessage: vi.fn(),
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
      ocapCliPath: 'ocap',
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

    it('registers three tools', () => {
      const tools = setupPlugin();
      expect([...tools.keys()]).toStrictEqual([
        'metamask_request_capability',
        'metamask_call_capability',
        'metamask_list_capabilities',
      ]);
    });
  });

  describe('config schema', () => {
    it('accepts valid config', () => {
      const result = pluginEntry.configSchema.safeParse({
        ocapCliPath: '/usr/bin/ocap',
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
    it('redeems URL then requests capability', async () => {
      mockRedeemUrl.mockResolvedValueOnce('ko10');
      mockQueueMessage.mockResolvedValueOnce({
        body: '#"$0.Alleged: PersonalMessageSigner"',
        slots: ['ko5'],
      });

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      const result = await tool.execute('id1', {
        request: 'sign personal messages',
      });

      expect(result.content[0].text).toContain('PersonalMessageSigner');
      expect(result.content[0].text).toContain('ko5');

      expect(mockRedeemUrl).toHaveBeenCalledWith(
        'ocap:test123@12D3KooWtest,/ip4/127.0.0.1/tcp/9090',
      );
      expect(mockQueueMessage).toHaveBeenCalledWith({
        target: 'ko10',
        method: 'requestCapability',
        args: ['sign personal messages'],
        raw: true,
      });
    });

    it('reuses cached vendor kref on second request', async () => {
      mockRedeemUrl.mockResolvedValueOnce('ko10');
      mockQueueMessage
        .mockResolvedValueOnce({
          body: '#"$0.Alleged: PersonalMessageSigner"',
          slots: ['ko5'],
        })
        .mockResolvedValueOnce({
          body: '#"$0.Alleged: TokenSender"',
          slots: ['ko6'],
        });

      const tools = setupPlugin();
      const tool = tools.get('metamask_request_capability')!;
      await tool.execute('id1', { request: 'sign messages' });
      await tool.execute('id2', { request: 'send tokens' });

      // redeemUrl called only once
      expect(mockRedeemUrl).toHaveBeenCalledTimes(1);
      expect(mockQueueMessage).toHaveBeenCalledTimes(2);
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
  });

  describe('metamask_call_capability', () => {
    /**
     * Set up the plugin with a pre-obtained capability.
     *
     * @returns The tools map.
     */
    async function setupWithCapability(): Promise<Map<string, ToolDefinition>> {
      mockRedeemUrl.mockResolvedValueOnce('ko10');
      mockQueueMessage.mockResolvedValueOnce({
        body: '#"$0.Alleged: PersonalMessageSigner"',
        slots: ['ko5'],
      });

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
        capability: 'PersonalMessageSigner',
        method: 'getAccounts',
      });

      expect(result.content[0].text).toContain('0xabc123');
      expect(mockQueueMessage).toHaveBeenCalledWith({
        target: 'ko5',
        method: 'getAccounts',
        args: [],
      });
    });

    it('calls method on capability by kref', async () => {
      const tools = await setupWithCapability();

      mockQueueMessage.mockResolvedValueOnce('0xsig...');

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'ko5',
        method: 'signMessage',
        args: '["0xabc", "hello", "0x1"]',
      });

      expect(result.content[0].text).toContain('0xsig...');
      expect(mockQueueMessage).toHaveBeenCalledWith({
        target: 'ko5',
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
      expect(result.content[0].text).toContain('PersonalMessageSigner');
    });

    it('returns error for invalid args JSON', async () => {
      const tools = await setupWithCapability();

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'PersonalMessageSigner',
        method: 'getAccounts',
        args: 'not-json',
      });

      expect(result.content[0].text).toContain('Error:');
    });

    it('returns error when args is not an array', async () => {
      const tools = await setupWithCapability();

      const tool = tools.get('metamask_call_capability')!;
      const result = await tool.execute('id2', {
        capability: 'PersonalMessageSigner',
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

    it('lists obtained capabilities', async () => {
      mockRedeemUrl.mockResolvedValueOnce('ko10');
      mockQueueMessage.mockResolvedValueOnce({
        body: '#"$0.Alleged: PersonalMessageSigner"',
        slots: ['ko5'],
      });

      const tools = setupPlugin();
      await tools.get('metamask_request_capability')!.execute('id1', {
        request: 'sign messages',
      });

      const tool = tools.get('metamask_list_capabilities')!;
      const result = await tool.execute('id2');

      expect(result.content[0].text).toContain('Capabilities (1)');
      expect(result.content[0].text).toContain('PersonalMessageSigner');
      expect(result.content[0].text).toContain('ko5');
      expect(result.content[0].text).toContain('sign messages');
    });
  });
});
