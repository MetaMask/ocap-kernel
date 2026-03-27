/* eslint-disable */
/**
 * Minimal agent loop for Ollama (native API) or OpenAI-compatible LLM.
 *
 * Configured via env vars (with Ollama defaults):
 *   LLM_BASE_URL  — base URL of the LLM service (default: http://llm:11434)
 *   LLM_MODEL     — model name (default: qwen2.5:0.5b)
 *   LLM_API       — api type: 'ollama' or 'openai' (default: ollama)
 *
 * Small models may output tool calls as text in <tool_call> tags.
 * This module handles both structured and text-based tool call formats.
 */

const LLM_BASE_URL = process.env.LLM_BASE_URL ?? 'http://llm:11434';
const LLM_MODEL = process.env.LLM_MODEL ?? 'qwen2.5:0.5b';
const LLM_API = process.env.LLM_API ?? 'ollama';

// Derive chat endpoint from base URL and API type
const CHAT_URL =
  LLM_API === 'openai'
    ? `${LLM_BASE_URL}/chat/completions`
    : `${LLM_BASE_URL}/api/chat`;

const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'wallet_balance',
      description: 'Get the ETH balance of the wallet',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wallet_send',
      description: 'Send ETH to an address',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient address' },
          value: { type: 'string', description: 'Amount in ETH (e.g. "0.01")' },
        },
        required: ['to', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wallet_sign',
      description: 'Sign a message with the wallet',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Message to sign' },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wallet_accounts',
      description: 'Get wallet accounts/addresses',
      parameters: { type: 'object', properties: {} },
    },
  },
];

const TOOL_NAMES = TOOL_SCHEMAS.map((t) => t.function.name);

/**
 * Parse tool calls from text content (for models that output them as text).
 * Handles <tool_call>{"name":"...","arguments":...}</tool_call> format.
 */
function parseTextToolCalls(content) {
  const calls = [];
  // Match <tool_call> JSON </tool_call> blocks
  const tagPattern = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
  let match;
  while ((match = tagPattern.exec(content)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed.name && TOOL_NAMES.includes(parsed.name)) {
        calls.push({
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments ?? {}),
          },
        });
      }
    } catch {
      // Skip malformed JSON
    }
  }

  // Also try to find tool names mentioned directly in text as a fallback
  if (calls.length === 0) {
    for (const name of TOOL_NAMES) {
      if (content.includes(name)) {
        calls.push({
          function: { name, arguments: '{}' },
        });
        break; // Only take the first match
      }
    }
  }

  return calls;
}

/**
 * Execute a tool call against the wallet daemon.
 */
async function executeTool(toolCall, callAway, awayCoordKref) {
  const { name } = toolCall.function;
  let args = {};
  try {
    const rawArgs = toolCall.function.arguments;
    args = typeof rawArgs === 'string' ? JSON.parse(rawArgs) : (rawArgs ?? {});
  } catch {
    args = {};
  }

  switch (name) {
    case 'wallet_balance': {
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      const balance = await callAway(awayCoordKref, 'request', [
        'eth_getBalance',
        [accounts[0], 'latest'],
      ]);
      return `Balance: ${(parseInt(balance, 16) / 1e18).toFixed(4)} ETH`;
    }
    case 'wallet_send': {
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      const weiValue = `0x${(parseFloat(args.value || '0.01') * 1e18).toString(16)}`;
      const txHash = await callAway(awayCoordKref, 'request', [
        'eth_sendTransaction',
        [{ from: accounts[0], to: args.to || '0x70997970c51812dc3a010c7d01b50e0d17dc79c8', value: weiValue }],
      ]);
      return `Transaction sent: ${txHash}`;
    }
    case 'wallet_sign': {
      const sig = await callAway(awayCoordKref, 'signMessage', [args.message || 'test']);
      return `Signature: ${sig}`;
    }
    case 'wallet_accounts': {
      const accounts = await callAway(awayCoordKref, 'getAccounts');
      return `Accounts: ${accounts.join(', ')}`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Run a single agent loop: send user message, handle tool calls, return final response.
 */
export async function runAgentLoop({ userMessage, callAway, awayCoordKref, systemPrompt }) {
  const messages = [
    {
      role: 'system',
      content: systemPrompt || 'You are a helpful wallet assistant. Use the available tools to help the user with their wallet operations. Always use tools when asked about balance, sending, signing, or accounts.',
    },
    { role: 'user', content: userMessage },
  ];

  const toolCalls = [];
  const maxTurns = 5;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:0.5b',
        messages,
        tools: TOOL_SCHEMAS,
        stream: false,
      }),
    });

    const json = await response.json();
    // Normalize response: Ollama returns {message}, OpenAI returns {choices[0].message}
    const assistantMsg =
      LLM_API === 'openai' ? json.choices?.[0]?.message : json.message;

    if (!assistantMsg) {
      return { response: 'No response from model', toolCalls };
    }

    messages.push(assistantMsg);

    // Check for structured tool calls first
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const tc of assistantMsg.tool_calls) {
        toolCalls.push(tc);
        try {
          const result = await executeTool(tc, callAway, awayCoordKref);
          messages.push({ role: 'tool', content: result });
        } catch (error) {
          messages.push({ role: 'tool', content: `Error: ${error.message}` });
        }
      }
      continue;
    }

    // Check for text-based tool calls (small models often do this)
    if (assistantMsg.content) {
      const textCalls = parseTextToolCalls(assistantMsg.content);
      if (textCalls.length > 0) {
        for (const tc of textCalls) {
          toolCalls.push(tc);
          try {
            const result = await executeTool(tc, callAway, awayCoordKref);
            messages.push({ role: 'tool', content: result });
          } catch (error) {
            messages.push({ role: 'tool', content: `Error: ${error.message}` });
          }
        }
        continue;
      }
    }

    // No tool calls — final response
    return { response: assistantMsg.content, toolCalls };
  }

  const lastMsg = messages[messages.length - 1];
  return { response: lastMsg.content || 'Max turns exceeded', toolCalls };
}
