import { useEffect, useRef } from 'react';

import { formatUsd } from '../format.ts';
import type { EventEntry } from '../hooks/useEventStream.ts';

type EventsProps = {
  entries: EventEntry[];
};

/**
 * Render the dashboard's event log: a chronological stream of the
 * agent's narration, phase transitions, matcher queries / replies,
 * and wallet charges. Oldest at top so the audience can read the
 * arc top-to-bottom as it unfolds. The list auto-scrolls to the
 * bottom whenever entries grow so the latest activity is always in
 * view without manual scroll-bar fiddling.
 *
 * Previously labelled "Transcript", but with the producer-LLM
 * dialog now living in its own pane (the ttyd iframe), the agent's
 * narration here reads less like a transcript and more like an
 * event stream — hence the relabel.
 *
 * @param props - Component props.
 * @param props.entries - Event entries reduced from the SSE
 *   stream, oldest first.
 * @returns The rendered event log.
 */
export function Events(props: EventsProps): JSX.Element {
  const { entries } = props;
  const listRef = useRef<HTMLOListElement | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = list.scrollHeight;
    }
  }, [entries.length]);
  return (
    <section className="events">
      <header className="events__header">
        <h2>Events</h2>
        <span className="events__count">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </span>
      </header>
      {entries.length === 0 ? (
        <div className="events__empty">Waiting for the agent…</div>
      ) : (
        <ol className="events__list" ref={listRef}>
          {entries.map((entry, idx) => (
            <EventLine key={`${entry.at}-${idx}`} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}

type EventLineProps = {
  entry: EventEntry;
};

/**
 * Render a single event line. Phase transitions get a chevron prefix
 * and a different color band so the audience can see workflow
 * progress at a glance.
 *
 * @param props - Component props.
 * @param props.entry - The event entry to render.
 * @returns The rendered line.
 */
function EventLine({ entry }: EventLineProps): JSX.Element {
  if (entry.kind === 'phase') {
    return (
      <li className="events__line events__line--phase">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__phase">→ {entry.phase}</span>
      </li>
    );
  }
  if (entry.kind === 'matcher-query') {
    return (
      <li className="events__line events__line--matcher">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__matcher">? matcher: {entry.description}</span>
      </li>
    );
  }
  if (entry.kind === 'matcher-results') {
    const tail =
      entry.providerTags.length === 0
        ? 'no candidates'
        : entry.providerTags.join(', ');
    return (
      <li className="events__line events__line--matcher">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__matcher">
          ← matcher: {entry.count} candidate{entry.count === 1 ? '' : 's'}
          {entry.count > 0 ? ` — ${tail}` : ''}
        </span>
      </li>
    );
  }
  if (entry.kind === 'wallet-charge') {
    const reason =
      typeof entry.reason === 'string' && entry.reason.length > 0
        ? entry.reason
        : 'service charge';
    return (
      <li className="events__line events__line--charge">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__charge">
          $ −{formatUsd(entry.amountUsd)} {reason} (balance{' '}
          {formatUsd(entry.balanceUsd)})
        </span>
      </li>
    );
  }
  if (entry.kind === 'wallet-credit') {
    const reason =
      typeof entry.reason === 'string' && entry.reason.length > 0
        ? entry.reason
        : 'wallet top-up';
    return (
      <li className="events__line events__line--credit">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__credit">
          $ +{formatUsd(entry.amountUsd)} {reason} (balance{' '}
          {formatUsd(entry.balanceUsd)})
        </span>
      </li>
    );
  }
  if (entry.kind === 'service-interaction') {
    return (
      <li className="events__line events__line--interaction">
        <span className="events__time">{formatTime(entry.at)}</span>
        <span className="events__interaction">
          {entry.from} → {entry.to}: {entry.interaction}
        </span>
      </li>
    );
  }
  return (
    <li className="events__line events__line--note">
      <span className="events__time">{formatTime(entry.at)}</span>
      <span className="events__note">{entry.note}</span>
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
