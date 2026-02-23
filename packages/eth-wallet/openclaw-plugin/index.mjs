/* eslint-disable jsdoc/require-description, jsdoc/require-param-description, jsdoc/require-param-type, jsdoc/require-returns, id-denylist */
/**
 * OpenClaw wallet plugin: registers tools that forward to the OCAP daemon.
 *
 * The OCAP daemon runs the eth-wallet subcluster. This plugin sends JSON-RPC
 * messages to the daemon over its Unix socket, routing wallet operations
 * through the kernel's capability system. The AI agent never touches keys.
 *
 * Enable tools via agents.list[].tools.allow: ["wallet_balance", "wallet_send"]
 * or allow all with ["wallet"].
 *
 * Config (in openclaw plugin settings):
 *   ocapCliPath  - Absolute path to the `ocap` CLI binary (or omit to use PATH)
 *   walletKref   - The kernel reference for the wallet coordinator (e.g. "ko4")
 */
import { spawn } from "node:child_process";

const DEFAULT_CLI = "ocap";
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * @param {object} options
 */
function runDaemonExec(options) {
  const { cliPath, method, params, timeoutMs } = options;
  const args = ["daemon", "exec", method, JSON.stringify(params)];

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } finally {
        reject(new Error(`ocap daemon exec timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/**
 * @param {object} options
 */
async function callWallet(options) {
  const { cliPath, walletKref, method, args, timeoutMs } = options;
  const result = await runDaemonExec({
    cliPath,
    method: "queueMessage",
    params: [walletKref, method, args],
    timeoutMs,
  });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim();
    throw new Error(`Wallet ${method} failed (exit ${result.code}): ${detail}`);
  }

  return result.stdout.trim();
}

/**
 * @param {object} api
 */
export default function register(api) {
  const pluginConfig = api.pluginConfig;
  const cliPath =
    typeof pluginConfig?.ocapCliPath === "string"
      ? pluginConfig.ocapCliPath.trim()
      : DEFAULT_CLI;
  const walletKref =
    typeof pluginConfig?.walletKref === "string"
      ? pluginConfig.walletKref.trim()
      : "ko4";
  const timeoutMs =
    typeof pluginConfig?.timeoutMs === "number"
      ? pluginConfig.timeoutMs
      : DEFAULT_TIMEOUT_MS;

  api.registerTool(
    {
      name: "wallet_balance",
      label: "Wallet balance",
      description:
        "Get the ETH balance for a wallet address. Uses the OCAP daemon; no key access needed.",
      parameters: {
        type: "object",
        properties: {
          address: { type: "string", description: "Ethereum address (0x...)" },
        },
        required: ["address"],
      },
      async execute(_id, params) {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "request",
          args: ["eth_getBalance", [params.address, "latest"]],
          timeoutMs,
        });
        return { content: [{ type: "text", text: result }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "wallet_send",
      label: "Wallet send",
      description:
        "Send ETH to an address. The kernel handles signing via delegations or peer wallet.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient address (0x...)" },
          value: {
            type: "string",
            description: "Value in hex wei (e.g. '0xde0b6b3a7640000' for 1 ETH)",
          },
        },
        required: ["to", "value"],
      },
      async execute(_id, params) {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "sendTransaction",
          args: [{ to: params.to, value: params.value }],
          timeoutMs,
        });
        return { content: [{ type: "text", text: result }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "wallet_sign",
      label: "Wallet sign",
      description:
        "Sign a message. May forward to the home kernel for approval.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Message to sign" },
        },
        required: ["message"],
      },
      async execute(_id, params) {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "signMessage",
          args: [params.message],
          timeoutMs,
        });
        return { content: [{ type: "text", text: result }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "wallet_capabilities",
      label: "Wallet capabilities",
      description:
        "Check wallet capabilities: local keys, delegations, peer wallet, bundler.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "getCapabilities",
          args: [],
          timeoutMs,
        });
        return { content: [{ type: "text", text: result }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "wallet_accounts",
      label: "Wallet accounts",
      description: "List all wallet accounts.",
      parameters: { type: "object", properties: {} },
      async execute() {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "getAccounts",
          args: [],
          timeoutMs,
        });
        return { content: [{ type: "text", text: result }] };
      },
    },
    { optional: true },
  );
}
