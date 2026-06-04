import type { TranscriptEntry } from '../hooks/useEventStream.ts';

type TranscriptProps = {
  entries: TranscriptEntry[];
};

/**
 * Render the agent's narration transcript. Each `agent.note` becomes
 * a line; each `phase.announced` becomes a phase-transition marker
 * (visually distinct from notes). Oldest at top so the audience can
 * read the arc top-to-bottom as it unfolds.
 *
 * @param props - Component props.
 * @param props.entries - Transcript entries reduced from the SSE
 *   stream, oldest first.
 * @returns The rendered transcript.
 */
export function Transcript(props: TranscriptProps): JSX.Element {
  const { entries } = props;
  return (
    <section className="transcript">
      <header className="transcript__header">
        <h2>Transcript</h2>
        <span className="transcript__count">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </span>
      </header>
      {entries.length === 0 ? (
        <div className="transcript__empty">Waiting for the agent…</div>
      ) : (
        <ol className="transcript__list">
          {entries.map((entry, idx) => (
            <TranscriptLine key={`${entry.at}-${idx}`} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

type TranscriptLineProps = {
  entry: TranscriptEntry;
};

/**
 * Render a single transcript line. Phase transitions get a chevron
 * prefix and a different color band so the audience can see workflow
 * progress at a glance.
 *
 * @param props - Component props.
 * @param props.entry - The transcript entry to render.
 * @returns The rendered line.
 */
function TranscriptLine({ entry }: TranscriptLineProps): JSX.Element {
  if (entry.kind === 'phase') {
    return (
      <li className="transcript__line transcript__line--phase">
        <span className="transcript__time">{formatTime(entry.at)}</span>
        <span className="transcript__phase">→ {entry.phase}</span>
      </li>
    );
  }
  return (
    <li className="transcript__line transcript__line--note">
      <span className="transcript__time">{formatTime(entry.at)}</span>
      <span className="transcript__note">{entry.note}</span>
    </li>
  );
}

/**
 * Format an ISO timestamp as HH:MM:SS in the viewer's local timezone.
 * Falls back to the raw string on parse failure so a malformed value
 * doesn't crash the row.
 *
 * @param iso - ISO-8601 timestamp string.
 * @returns The formatted time, or the original string if it didn't parse.
 */
function formatTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleTimeString();
}
