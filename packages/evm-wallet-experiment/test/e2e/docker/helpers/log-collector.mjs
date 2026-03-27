/* eslint-disable */
import { readFileSync, existsSync } from 'node:fs';

/**
 * Reads log files from /logs/ and provides query methods.
 */
export function makeLogCollector(logDir = '/logs') {
  const tags = ['evm', 'llm', 'home', 'away'];
  let entries = [];

  function parseLine(tag, line) {
    // Try to parse @metamask/logger file transport format:
    // 2024-01-01T00:00:00.000Z [info] [tag] message
    const match = line.match(/^(\S+)\s+\[(\w+)\]\s+(?:\[([^\]]*)\]\s+)?(.*)$/);
    if (match) {
      return {
        timestamp: match[1],
        level: match[2],
        tags: match[3] ? match[3].split(',') : [tag],
        message: match[4],
        source: tag,
      };
    }
    // Raw line (evm/llm stdout)
    return {
      timestamp: new Date().toISOString(),
      level: 'info',
      tags: [tag],
      message: line,
      source: tag,
    };
  }

  function refresh() {
    entries = [];
    for (const tag of tags) {
      const filePath = `${logDir}/${tag}.log`;
      if (!existsSync(filePath)) continue;
      const content = readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        if (line.trim()) {
          entries.push(parseLine(tag, line));
        }
      }
    }
    return entries;
  }

  refresh();

  return {
    get entries() { return entries; },
    refresh,
    forTag(tag) { return entries.filter((e) => e.source === tag || e.tags.includes(tag)); },
    find(pattern) {
      const re = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      return entries.filter((e) => re.test(e.message));
    },
  };
}
