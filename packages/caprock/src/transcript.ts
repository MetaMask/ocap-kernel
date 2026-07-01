import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { getClaudeProjectsDir } from './paths/user.ts';

export type TranscriptToolUse = {
  name: string;
  input?: Record<string, unknown>;
};

/**
 * Search `~/.claude/projects/` for a transcript matching the given session ID.
 * The transcript lives at `<projects>/<cwd-encoded>/<sessionId>.jsonl`, but we
 * don't know the cwd-encoded segment here, so we scan all project dirs.
 *
 * @param sessionId - The Claude Code session ID to locate.
 * @returns The absolute path to the transcript, or null if not found.
 */
export async function findTranscript(
  sessionId: string,
): Promise<string | null> {
  let dirs: string[];
  try {
    dirs = await readdir(getClaudeProjectsDir());
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const candidate = join(getClaudeProjectsDir(), dir, `${sessionId}.jsonl`);
    try {
      await stat(candidate);
      return candidate;
    } catch {
      // file doesn't exist, continue
    }
  }
  return null;
}

type ContentItem = {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
};
type TranscriptLine = { message?: { content?: ContentItem[] } };

/**
 * Extract tool invocations from a Claude Code transcript JSONL.
 * Each line is a JSON object; tool uses appear as content items with
 * `type === 'tool_use'` inside `.message.content` arrays.
 *
 * @param transcriptPath - The path to the transcript JSONL file.
 * @returns The list of tool use records found in the transcript.
 */
export async function readTranscriptToolUses(
  transcriptPath: string,
): Promise<TranscriptToolUse[]> {
  const raw = await readFile(transcriptPath, 'utf8');
  const results: TranscriptToolUse[] = [];
  for (const line of raw.split('\n').filter((ln) => ln.trim().length > 0)) {
    let parsed: TranscriptLine;
    try {
      parsed = JSON.parse(line) as TranscriptLine;
    } catch {
      continue;
    }
    const content = parsed.message?.content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'tool_use' && item.name) {
          const toolUse: TranscriptToolUse = { name: item.name };
          if (item.input !== undefined) {
            toolUse.input = item.input;
          }
          results.push(toolUse);
        }
      }
    }
  }
  return results;
}
