/**
 * Produce a `PermissionRequest` hook output that grants the request.
 *
 * @returns Serialized hook output JSON.
 */
export function permissionAllow(): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'allow' },
    },
  });
}

/**
 * Produce a `PreToolUse` hook output that denies the tool call.
 *
 * @param reason - Human-readable reason shown to Claude Code.
 * @returns Serialized hook output JSON.
 */
export function preToolUseDeny(reason: string): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
}
