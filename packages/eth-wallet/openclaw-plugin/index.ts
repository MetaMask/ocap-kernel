/* eslint-disable @typescript-eslint/no-explicit-any */
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
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";

const DEFAULT_CLI = "ocap";
const DEFAULT_TIMEOUT_MS = 60_000;

type ExecResult = { stdout: string; stderr: string; code: number | null };

/**
 * Run an `ocap daemon exec` command and return its output.
 *
 * @param options - Execution options.
 * @param options.cliPath - Path to the ocap CLI.
 * @param options.method - The daemon RPC method.
 * @param options.params - The method parameters.
 * @param options.timeoutMs - Timeout in ms.
 * @returns The command result.
 */
function runDaemonExec(options: {
  cliPath: string;
  method: string;
  params: unknown;
  timeoutMs: number;
}): Promise<ExecResult> {
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
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } finally {
        reject(new Error(`ocap daemon exec timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    child.once("error", (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? null });
    });
  });
}

/**
 * Call a wallet coordinator method via the OCAP daemon.
 *
 * @param options - Call options.
 * @param options.cliPath - Path to the ocap CLI.
 * @param options.walletKref - Kernel reference for the wallet coordinator.
 * @param options.method - The coordinator method to call.
 * @param options.args - Arguments for the method.
 * @param options.timeoutMs - Timeout in ms.
 * @returns The command stdout.
 */
async function callWallet(options: {
  cliPath: string;
  walletKref: string;
  method: string;
  args: unknown[];
  timeoutMs: number;
}): Promise<string> {
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

const ETH_ADDRESS_RE = /^0x[\da-f]{40}$/iu;
const HEX_VALUE_RE = /^0x[\da-f]+$/iu;

/**
 * Format an error response for the plugin.
 *
 * @param text - The error message text.
 * @returns A plugin tool response containing the error.
 */
function makeError(text: string): {
  content: { type: "text"; text: string }[];
} {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }] };
}

/**
 * Register the wallet plugin tools.
 *
 * @param api - The OpenClaw plugin API.
 */
export default function register(api: any): void {
  const pluginConfig = api.pluginConfig as Record<string, unknown> | undefined;
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
      parameters: Type.Object({
        address: Type.String({ description: "Ethereum address (0x...)" }),
      }),
      async execute(_id: string, params: { address: string }) {
        if (!ETH_ADDRESS_RE.test(params.address)) {
          return makeError("Invalid Ethereum address. Must be 0x followed by 40 hex characters.");
        }
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "request",
          args: ["eth_getBalance", [params.address, "latest"]],
          timeoutMs,
        });
        return { content: [{ type: "text" as const, text: result }] };
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
      parameters: Type.Object({
        to: Type.String({ description: "Recipient address (0x...)" }),
        value: Type.String({
          description:
            "Value in hex wei (e.g. '0xde0b6b3a7640000' for 1 ETH)",
        }),
      }),
      async execute(_id: string, params: { to: string; value: string }) {
        if (!ETH_ADDRESS_RE.test(params.to)) {
          return makeError("Invalid recipient address. Must be 0x followed by 40 hex characters.");
        }
        if (!HEX_VALUE_RE.test(params.value)) {
          return makeError("Invalid value. Must be a hex string (e.g. '0xde0b6b3a7640000' for 1 ETH).");
        }
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "sendTransaction",
          args: [{ to: params.to, value: params.value }],
          timeoutMs,
        });
        return { content: [{ type: "text" as const, text: result }] };
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
      parameters: Type.Object({
        message: Type.String({ description: "Message to sign" }),
      }),
      async execute(_id: string, params: { message: string }) {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "signMessage",
          args: [params.message],
          timeoutMs,
        });
        return { content: [{ type: "text" as const, text: result }] };
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
      parameters: Type.Object({}),
      async execute() {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "getCapabilities",
          args: [],
          timeoutMs,
        });
        return { content: [{ type: "text" as const, text: result }] };
      },
    },
    { optional: true },
  );

  api.registerTool(
    {
      name: "wallet_accounts",
      label: "Wallet accounts",
      description: "List all wallet accounts.",
      parameters: Type.Object({}),
      async execute() {
        const result = await callWallet({
          cliPath,
          walletKref,
          method: "getAccounts",
          args: [],
          timeoutMs,
        });
        return { content: [{ type: "text" as const, text: result }] };
      },
    },
    { optional: true },
  );
}
