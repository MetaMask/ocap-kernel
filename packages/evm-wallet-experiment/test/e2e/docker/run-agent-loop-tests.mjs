/* eslint-disable no-plusplus, jsdoc/require-description, jsdoc/require-returns, jsdoc/require-param-description, n/no-process-env */
/**
 * Agent loop test suite for Docker E2E.
 *
 * Uses the Ollama agent helper to test LLM-driven wallet operations.
 * These tests verify that a small local model (qwen2.5:0.5b) can
 * invoke wallet tools and produce meaningful responses.
 *
 * NOTE: Small models are unreliable with tool calling. Tests assert
 * that the agent loop completes and produces output, with tool usage
 * as a bonus check rather than a hard requirement.
 */

import { runAgentLoop } from './helpers/ollama-agent.mjs';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${label}`);
  } else {
    failed++;
    console.error(`  \u2717 ${label}`);
  }
}

/**
 * @param {object} ctx
 * @param {Function} ctx.callAway
 * @param {object} ctx.awayInfo
 * @param {object} ctx.logCollector
 */
export async function runAgentLoopTests(ctx) {
  const { callAway, awayInfo } = ctx;
  passed = 0;
  failed = 0;

  const awayCoordKref = awayInfo.coordinatorKref;

  // -- Test 1: Balance query --
  console.log('\n--- Agent: "What is my wallet balance?" ---');
  try {
    const balanceResult = await runAgentLoop({
      userMessage: 'What is my wallet balance? Use the wallet_balance tool.',
      callAway: (_target, method, args) => callAway(method, args),
      awayCoordKref,
    });

    const responsePreview = balanceResult.response?.slice(0, 120) || '(empty)';
    console.log(`  Response: ${responsePreview}...`);
    const toolNames =
      balanceResult.toolCalls.map((tc) => tc.function.name).join(', ') ||
      'none';
    console.log(`  Tool calls: ${toolNames}`);

    assert(
      balanceResult.response && balanceResult.response.length > 0,
      'agent produced a response',
    );

    const usedBalanceTool = balanceResult.toolCalls.some(
      (tc) => tc.function.name === 'wallet_balance',
    );
    if (usedBalanceTool) {
      console.log('  \u2713 (bonus) agent used wallet_balance tool');
    } else {
      console.log(
        '  \u2139 agent did not use wallet_balance tool (small model limitation)',
      );
    }
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    assert(false, 'balance query completed without error');
  }

  // -- Test 2: LLM health --
  const llmBase = process.env.LLM_BASE_URL ?? 'http://llm:11434';
  const llmApi = process.env.LLM_API ?? 'ollama';
  console.log(`\n--- LLM health (${llmApi}) ---`);
  try {
    if (llmApi === 'ollama') {
      const resp = await fetch(`${llmBase}/api/tags`);
      const json = await resp.json();
      assert(resp.ok, 'Ollama API responds');
      assert(
        json.models && json.models.length > 0,
        `model loaded: ${json.models?.[0]?.name || 'unknown'}`,
      );
    } else {
      const resp = await fetch(`${llmBase}/models`);
      assert(resp.ok, 'LLM API responds');
      const llmModel = process.env.LLM_MODEL ?? '(unknown)';
      assert(true, `model configured: ${llmModel}`);
    }
  } catch (error) {
    assert(false, `LLM health check failed: ${error.message}`);
  }

  return { passed, failed };
}
