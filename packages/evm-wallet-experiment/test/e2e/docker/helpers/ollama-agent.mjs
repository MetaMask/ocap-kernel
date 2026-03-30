/* eslint-disable */
/**
 * Agent loop using makeChatAgent from @ocap/kernel-agents.
 *
 * Configured via env vars (with Ollama defaults):
 *   LLM_BASE_URL  — base URL of the LLM service (default: http://llm:11434)
 *   LLM_MODEL     — model name (default: qwen2.5:0.5b)
 *   LLM_API       — api type: 'ollama' or 'openai' (default: ollama)
 *
 * Uses the OpenAI-compatible chat completions endpoint so that makeChatAgent
 * can parse the response format (choices[0].message).
 */

import { capability } from '@ocap/kernel-agents/capabilities/capability';
import { makeChatAgent } from '@ocap/kernel-agents/chat';

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://llm:11434';
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen2.5:0.5b';
const LLM_API = process.env.LLM_API ?? 'ollama';

// Ollama exposes /v1/chat/completions as an OpenAI-compatible endpoint
const CHAT_URL =
  LLM_API === 'openai'
    ? `${LLM_BASE_URL}/chat/completions`
    : `${LLM_BASE_URL}/v1/chat/completions`;

/**
 * Run a single agent loop: send user message, handle tool calls, return final response.
 */
export async function runAgentLoop({ userMessage, callAway, awayCoordKref, systemPrompt }) {
  const toolCalls = [];

  const walletBalance = capability(
    async () => {
      toolCalls.push({ function: { name: 'wallet_balance', arguments: '{}' } });
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      const balance = await callAway(awayCoordKref, 'request', [
        'eth_getBalance',
        [accounts[0], 'latest'],
      ]);
      return `Balance: ${(parseInt(balance, 16) / 1e18).toFixed(4)} ETH`;
    },
    { description: 'Get the ETH balance of the wallet', args: {}, returns: { type: 'string' } },
  );

  const walletAccounts = capability(
    async () => {
      toolCalls.push({ function: { name: 'wallet_accounts', arguments: '{}' } });
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      return `Accounts: ${accounts.join(', ')}`;
    },
    { description: 'Get wallet accounts/addresses', args: {}, returns: { type: 'string' } },
  );

  const walletSend = capability(
    async ({ to, value }) => {
      toolCalls.push({ function: { name: 'wallet_send', arguments: JSON.stringify({ to, value }) } });
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      const weiValue = `0x${(parseFloat(value || '0.01') * 1e18).toString(16)}`;
      const txHash = await callAway(awayCoordKref, 'request', [
        'eth_sendTransaction',
        [{ from: accounts[0], to: to || '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', value: weiValue }],
      ]);
      return `Transaction sent: ${txHash}`;
    },
    {
      description: 'Send ETH to an address',
      args: {
        to: { type: 'string' },
        value: { type: 'string' },
      },
      returns: { type: 'string' },
    },
  );

  const walletSign = capability(
    async ({ message }) => {
      toolCalls.push({ function: { name: 'wallet_sign', arguments: JSON.stringify({ message }) } });
      const sig = await callAway(awayCoordKref, 'signMessage', [message || 'test']);
      return `Signature: ${sig}`;
    },
    {
      description: 'Sign a message with the wallet',
      args: { message: { type: 'string' } },
      returns: { type: 'string' },
    },
  );

  const chat = async (messages) => {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: LLM_MODEL, messages, stream: false }),
    });
    return response.json();
  };

  const agent = makeChatAgent({
    chat,
    capabilities: {
      wallet_balance: walletBalance,
      wallet_accounts: walletAccounts,
      wallet_send: walletSend,
      wallet_sign: walletSign,
    },
  });

  // Prepend custom system prompt to user intent if provided
  const intent = systemPrompt ? `${systemPrompt}\n\n${userMessage}` : userMessage;
  const response = await agent.task(intent, undefined, { invocationBudget: 5 });
  return { response, toolCalls };
}
