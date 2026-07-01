/* eslint-disable no-console */
/* eslint-disable n/no-process-env */
import type {
  InvocationPattern,
  Provision,
} from '@metamask/kernel-utils/session/provision';
import {
  argPatternDisplay,
  matchProvision,
} from '@metamask/kernel-utils/session/provision';

import { buildClauses } from '../src/clauses.ts';
import { getSocketPath } from '../src/paths/ocap-kernel.ts';
import { listVatProvisions, pingDaemon } from '../src/rpc.ts';
import { loadSessionState, readEvents } from '../src/session.ts';
import { findTranscript, readTranscriptToolUses } from '../src/transcript.ts';
import type { TranscriptToolUse } from '../src/transcript.ts';

// ─── Formatting helpers ───────────────────────────────────────

/**
 * Format an invocation pattern as a single human-readable line.
 *
 * @param pat - The invocation pattern to format.
 * @returns A space-separated string of the command name and its arg patterns.
 */
function formatInvocationPattern(pat: InvocationPattern): string {
  return [pat.name, ...pat.argPatterns.map(argPatternDisplay)].join(' ');
}

/**
 * Format a provision as a single human-readable line.
 *
 * @param provision - The provision to format.
 * @returns A `[tool] pat1 | pat2` string.
 */
function formatProvision(provision: Provision): string {
  const pats = provision.patterns.map(formatInvocationPattern).join(' | ');
  return `[${provision.tool}] ${pats}`;
}

/**
 * Returns true if the provision contains any wildcard or prefix pattern.
 *
 * @param provision - The provision to inspect.
 * @returns True if any arg pattern is `wildcard` or `prefix`.
 */
function isStandingProvision(provision: Provision): boolean {
  return provision.patterns.some((pat) =>
    pat.argPatterns.some(
      (ap) => ap.kind === 'wildcard' || ap.kind === 'prefix',
    ),
  );
}

// ─── Claude Code rule matching ────────────────────────────────

const TOOL_INPUT_KEY: Record<string, string> = {
  Bash: 'command',
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Glob: 'pattern',
  Grep: 'pattern',
  WebSearch: 'query',
  WebFetch: 'url',
};

/**
 * Convert a Claude Code glob pattern to a RegExp.
 *
 * Claude Code uses `command:*` as a suffix meaning "followed by any arguments".
 * `**` matches anything including path separators; bare `*` matches within a
 * segment.
 *
 * @param pattern - The Claude Code glob pattern to convert.
 * @returns A RegExp anchored to the full input.
 */
function rulePatternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
  // eslint-disable-next-line no-control-regex
  const doubleStarSentinel = /\x00/gu;
  // eslint-disable-next-line no-control-regex
  const colonStarSentinel = /\x01/gu;
  const globbed = escaped
    .replace(/\*\*/gu, '\x00') // placeholder for **
    .replace(/:\*/gu, '\x01') // placeholder for :* (must come before bare * pass)
    .replace(/\*/gu, '[^/]*') // bare * matches within a segment
    .replace(doubleStarSentinel, '.*') // ** matches across segments
    .replace(colonStarSentinel, '.*'); // :* means "and any arguments" — matches everything
  return new RegExp(`^${globbed}$`, 'u');
}

/**
 * Returns true if the given CC permission rule string matches a tool use.
 * Rule format: `ToolName(pattern)` where pattern is a glob. `Skill(...)`
 * entries are permission grants for skill invocations, not tool calls — always
 * false.
 *
 * @param use - The transcript tool-use record to test.
 * @param rule - The CC permission rule string to match against.
 * @returns True if the rule covers this tool call.
 */
function matchesRule(use: TranscriptToolUse, rule: string): boolean {
  const match = /^(\w[\w-]*)\((.+)\)$/u.exec(rule);
  if (!match) {
    return false;
  }
  const ruleTool = match[1];
  const pattern = match[2];
  if (
    ruleTool === undefined ||
    pattern === undefined ||
    ruleTool === 'Skill' ||
    ruleTool !== use.name
  ) {
    return false;
  }
  const key = TOOL_INPUT_KEY[use.name];
  if (key === undefined) {
    return pattern === '*';
  }
  const inputVal = use.input?.[key];
  if (typeof inputVal !== 'string') {
    return false;
  }
  return rulePatternToRegex(pattern).test(inputVal);
}

// ─── Main ─────────────────────────────────────────────────────

/**
 * Pluralize a noun based on count using "1 == singular, else plural".
 *
 * @param count - The count to test.
 * @param singular - The singular form (used when count is 1).
 * @param many - The plural form (used otherwise).
 * @returns Either the singular or plural form.
 */
function plural(count: number, singular: string, many: string): string {
  return count === 1 ? singular : many;
}

/**
 * Display the provision audit report for a session.
 *
 * @returns A promise that resolves when the report has been printed.
 */
async function main(): Promise<void> {
  const sessionId = process.argv[2] ?? process.env.CLAUDE_SESSION_ID;
  if (!sessionId) {
    console.log(
      'Session ID not provided — run this from within a Claude Code session.',
    );
    return;
  }

  const [state, events, transcriptPath] = await Promise.all([
    loadSessionState(sessionId),
    readEvents(sessionId),
    findTranscript(sessionId),
  ]);

  const toolUses = transcriptPath
    ? await readTranscriptToolUses(transcriptPath)
    : [];

  console.log(`caprock:audit\n`);
  console.log(`Session: ${sessionId}  |  ${toolUses.length} tool calls\n`);

  // ── 1. Claude Code permission rules ─────────────────────────

  // Allow rules: snapshot from session start + rule_grants added during session
  const allowRules: string[] = [
    ...(state?.settingsSnapshot ?? []),
    ...events
      .filter((ev) => ev.event === 'rule_grant')
      .map((ev) => ev.pattern as string),
  ];
  // Deduplicate, preserving order
  const seenAllow = new Set<string>();
  const uniqueAllowRules = allowRules.filter((rule) => {
    if (seenAllow.has(rule)) {
      return false;
    }
    seenAllow.add(rule);
    return true;
  });

  // Deny rules: from snapshot, or re-read from settings files if state has them
  const denyRules: string[] = state?.settingsDenySnapshot ?? [];
  const allowMatchCounts = new Map<string, number>();
  const denyMatchCounts = new Map<string, number>();
  for (const rule of uniqueAllowRules) {
    allowMatchCounts.set(rule, 0);
  }
  for (const rule of denyRules) {
    denyMatchCounts.set(rule, 0);
  }

  let ccCoveredCount = 0;
  for (const use of toolUses) {
    const allowedBy = uniqueAllowRules.filter((rule) => matchesRule(use, rule));
    const deniedBy = denyRules.filter((rule) => matchesRule(use, rule));
    if (allowedBy.length > 0 || deniedBy.length > 0) {
      ccCoveredCount += 1;
    }
    for (const rule of allowedBy) {
      allowMatchCounts.set(rule, (allowMatchCounts.get(rule) ?? 0) + 1);
    }
    for (const rule of deniedBy) {
      denyMatchCounts.set(rule, (denyMatchCounts.get(rule) ?? 0) + 1);
    }
  }

  const ccUncovered = toolUses.length - ccCoveredCount;

  console.log(
    `── Claude Code permission rules ${'─'.repeat(38 - 'Claude Code permission rules'.length)}`,
  );
  console.log(
    `  ${uniqueAllowRules.length} allow ${plural(uniqueAllowRules.length, 'rule', 'rules')},  ${denyRules.length} deny ${plural(denyRules.length, 'rule', 'rules')}  (${ccUncovered} calls not covered → went through vat/TUI)`,
  );
  console.log();

  const triggeredAllow = uniqueAllowRules.filter(
    (rule) => (allowMatchCounts.get(rule) ?? 0) > 0,
  );
  const untriggeredAllow = uniqueAllowRules.filter(
    (rule) => (allowMatchCounts.get(rule) ?? 0) === 0,
  );

  if (triggeredAllow.length > 0) {
    console.log(
      `  Allow rules triggered (${triggeredAllow.length}/${uniqueAllowRules.length}):`,
    );
    for (const rule of triggeredAllow) {
      const count = allowMatchCounts.get(rule) ?? 0;
      console.log(`    ${rule.padEnd(50)}  ${count}×`);
    }
    console.log();
  }
  if (untriggeredAllow.length > 0) {
    console.log(
      `  Allow rules never triggered (${untriggeredAllow.length}/${uniqueAllowRules.length}):`,
    );
    for (const rule of untriggeredAllow) {
      console.log(`    ${rule}`);
    }
    console.log();
  }

  const triggeredDeny = denyRules.filter(
    (rule) => (denyMatchCounts.get(rule) ?? 0) > 0,
  );
  if (denyRules.length > 0) {
    if (triggeredDeny.length > 0) {
      console.log(
        `  Deny rules triggered (${triggeredDeny.length}/${denyRules.length}):`,
      );
      for (const rule of triggeredDeny) {
        const count = denyMatchCounts.get(rule) ?? 0;
        console.log(`    ${rule.padEnd(50)}  ${count}×`);
      }
    } else {
      console.log(`  Deny rules: none triggered`);
    }
    console.log();
  }

  // ── 2 & 3. Provisions ───────────────────────────────────────

  console.log(`── Provisions ${'─'.repeat(58 - 'Provisions'.length)}`);

  // Actual triggers from event log
  type ProvisionEntry = { provision: Provision; actualCount: number };
  const actualTriggers = new Map<string, ProvisionEntry>();
  for (const ev of events) {
    if (ev.event !== 'provision_match') {
      continue;
    }
    const provisions = ev.provisions as Provision[] | undefined;
    if (!provisions || provisions.length === 0) {
      continue;
    }
    for (const prov of provisions) {
      const key = JSON.stringify(prov);
      const existing = actualTriggers.get(key);
      if (existing) {
        existing.actualCount += 1;
      } else {
        actualTriggers.set(key, { provision: prov, actualCount: 1 });
      }
    }
  }

  // Potential matches: query the vat if daemon is available
  const socketPath = getSocketPath();
  const daemonAlive = state !== null && (await pingDaemon(socketPath));
  let allProvisions: Provision[] = [];
  if (daemonAlive && state !== null) {
    allProvisions = await listVatProvisions(socketPath, state.rootKref);
  } else {
    // Fall back to provisions we know about from provision_match events
    allProvisions = [...actualTriggers.values()].map(
      (entry) => entry.provision,
    );
  }

  const standing = allProvisions.filter(isStandingProvision);
  const exact = allProvisions.filter((prov) => !isStandingProvision(prov));

  const daemonNote = daemonAlive
    ? ''
    : '  (daemon unavailable — showing known provisions only)';
  console.log(
    `  ${allProvisions.length} ${plural(allProvisions.length, 'provision', 'provisions')} in vat${daemonNote}`,
  );
  console.log();

  if (standing.length > 0) {
    // Compute potential matches for standing provisions
    const potentialCounts = new Map<string, number>();
    for (const prov of standing) {
      potentialCounts.set(JSON.stringify(prov), 0);
    }
    for (const use of toolUses) {
      const clauses = buildClauses(use.name, use.input);
      if (clauses === null) {
        continue;
      }
      for (const prov of standing) {
        const key = JSON.stringify(prov);
        const wouldMatch = clauses.some((clause) =>
          matchProvision(prov, use.name, clause),
        );
        if (wouldMatch) {
          potentialCounts.set(key, (potentialCounts.get(key) ?? 0) + 1);
        }
      }
    }

    console.log(`  Standing provisions (${standing.length}):`);
    const sortedStanding = [...standing].sort((aProv, bProv) => {
      const keyA = JSON.stringify(aProv);
      const keyB = JSON.stringify(bProv);
      return (
        (actualTriggers.get(keyB)?.actualCount ?? 0) -
        (actualTriggers.get(keyA)?.actualCount ?? 0)
      );
    });
    for (const prov of sortedStanding) {
      const key = JSON.stringify(prov);
      const potential = potentialCounts.get(key) ?? 0;
      const actual = actualTriggers.get(key)?.actualCount ?? 0;
      const potentialStr = `potential: ${potential} ${plural(potential, 'call', 'calls')}`;
      const actualStr = `actual: ${actual} ${plural(actual, 'call', 'calls')}`;
      console.log(`    ${formatProvision(prov)}`);
      console.log(`      ${potentialStr}  |  ${actualStr}`);
    }
    console.log();
  }

  if (exact.length > 0) {
    const exactActual = exact.reduce(
      (sum, prov) =>
        sum + (actualTriggers.get(JSON.stringify(prov))?.actualCount ?? 0),
      0,
    );
    console.log(
      `  Exact grants (one-time approvals): ${exact.length} ${plural(exact.length, 'provision', 'provisions')}  (${exactActual} ${plural(exactActual, 'call', 'calls')} triggered)`,
    );
    console.log();
  }

  const tuiAccepts = events.filter((ev) => ev.event === 'tui_accept').length;
  const tuiRejects = events.filter((ev) => ev.event === 'tui_reject').length;
  if (tuiAccepts > 0 || tuiRejects > 0) {
    console.log(
      `  TUI decisions:  ${tuiAccepts} accepted  |  ${tuiRejects} rejected`,
    );
    console.log();
  }
}

main().catch((error) => {
  process.stderr.write(`[caprock:audit] ${String(error)}\n`);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
