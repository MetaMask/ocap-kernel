import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { UNASSIGNED_PHASE } from '../hooks/useEventStream.ts';
import type { ArtifactRecordedEvent } from '../types.ts';

type WorkflowBoardProps = {
  announcedPhases: string[];
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>;
  activePhase: string | undefined;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
};

/**
 * Workflow board: one column per workflow phase the agent has
 * announced (via `phase.announced` events), in the order they were
 * announced. The dashboard intentionally carries no phase vocabulary
 * of its own — that lets a different demo run a different pipeline
 * without touching the display code.
 *
 * The column matching `activePhase` is highlighted so the audience
 * can see which beat is in flight. The `Unassigned` column appears
 * leftmost as a fallback if an artifact arrives before any phase has
 * been announced.
 *
 * Artifact cards carry a `consumes` list (set by the agent via
 * `demo_record_artifact`); the board overlays SVG lineage edges
 * connecting each consumed card to the consuming card, so the
 * audience can see how each output was derived from earlier work.
 * Edges default to visible; a toggle in the board header fades them
 * out for runs that read cleaner without them.
 *
 * @param props - Component props.
 * @param props.announcedPhases - Phases the agent has announced, in
 *   the order they were first announced.
 * @param props.artifactsByPhase - Per-phase artifact lists from the
 *   event-stream reducer.
 * @param props.activePhase - Phase the agent most recently announced
 *   (or `undefined` before the first announce).
 * @param props.onZoom - Callback to open the zoom overlay for an artifact.
 * @returns The rendered board.
 */
export function WorkflowBoard(props: WorkflowBoardProps): JSX.Element {
  const { announcedPhases, artifactsByPhase, activePhase, onZoom } = props;
  const columns = orderedColumns(announcedPhases, artifactsByPhase);
  const [edgesVisible, setEdgesVisible] = useState(true);
  const columnsContainerRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const registerCardRef = useCallback(
    (handle: string, element: HTMLLIElement | null) => {
      if (element === null) {
        cardRefs.current.delete(handle);
      } else {
        cardRefs.current.set(handle, element);
      }
    },
    [],
  );

  return (
    <section className="workflow-board">
      <header className="workflow-board__header">
        <h2>Workflow</h2>
        <div className="workflow-board__header-right">
          {activePhase === undefined ? null : (
            <span className="workflow-board__active">→ {activePhase}</span>
          )}
          <button
            type="button"
            className="workflow-board__edges-toggle"
            aria-pressed={edgesVisible}
            onClick={() => setEdgesVisible((value) => !value)}
            title={edgesVisible ? 'Hide lineage edges' : 'Show lineage edges'}
          >
            {edgesVisible ? 'edges on' : 'edges off'}
          </button>
        </div>
      </header>
      {columns.length === 0 ? (
        <div className="workflow-board__empty">
          Waiting for the agent to announce a phase…
        </div>
      ) : (
        <div className="workflow-board__columns" ref={columnsContainerRef}>
          {columns.map((phase) => (
            <PhaseColumn
              key={phase}
              phase={phase}
              artifacts={artifactsByPhase.get(phase) ?? []}
              isActive={phase === activePhase}
              onZoom={onZoom}
              registerCardRef={registerCardRef}
            />
          ))}
          <LineageEdges
            artifactsByPhase={artifactsByPhase}
            containerRef={columnsContainerRef}
            cardRefs={cardRefs}
            visible={edgesVisible}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Compute the rendered column order. Unassigned goes leftmost when
 * non-empty; announced phases follow in announce order; any phases
 * that have artifacts but were never announced (defensive — the
 * reducer routes to Unassigned in that case) are appended in their
 * insertion order.
 *
 * @param announcedPhases - Phase names the agent has announced.
 * @param artifactsByPhase - Per-phase artifact buckets.
 * @returns The phase names to render columns for, in order.
 */
function orderedColumns(
  announcedPhases: string[],
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if ((artifactsByPhase.get(UNASSIGNED_PHASE)?.length ?? 0) > 0) {
    out.push(UNASSIGNED_PHASE);
    seen.add(UNASSIGNED_PHASE);
  }
  for (const phase of announcedPhases) {
    if (seen.has(phase)) {
      continue;
    }
    out.push(phase);
    seen.add(phase);
  }
  for (const phase of artifactsByPhase.keys()) {
    if (seen.has(phase)) {
      continue;
    }
    out.push(phase);
    seen.add(phase);
  }
  return out;
}

type CardRefRegistrar = (handle: string, element: HTMLLIElement | null) => void;

type PhaseColumnProps = {
  phase: string;
  artifacts: ArtifactRecordedEvent[];
  isActive: boolean;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
  registerCardRef: CardRefRegistrar;
};

/**
 * A single phase column. Shows the phase name, a count of artifacts,
 * and a vertical stack of small artifact thumbnails.
 *
 * @param props - Component props.
 * @param props.phase - Phase name (column heading).
 * @param props.artifacts - Artifacts that landed in this phase.
 * @param props.isActive - Whether this column is the active phase.
 * @param props.onZoom - Callback to open the zoom overlay for an artifact.
 * @param props.registerCardRef - Callback to register each card's DOM
 *   node with the board so the lineage-edge overlay can find it by
 *   handle.
 * @returns The rendered column.
 */
function PhaseColumn({
  phase,
  artifacts,
  isActive,
  onZoom,
  registerCardRef,
}: PhaseColumnProps): JSX.Element {
  const className = `phase-column${
    isActive ? ' phase-column--active' : ''
  }${artifacts.length === 0 ? ' phase-column--empty' : ''}`;
  return (
    <div className={className}>
      <header className="phase-column__header">
        <span className="phase-column__name">{phase}</span>
        {artifacts.length === 0 ? null : (
          <span className="phase-column__count">{artifacts.length}</span>
        )}
      </header>
      <ul className="phase-column__cards">
        {artifacts.map((artifact) => (
          <ArtifactThumb
            key={artifact.handle}
            artifact={artifact}
            onZoom={onZoom}
            registerCardRef={registerCardRef}
          />
        ))}
      </ul>
    </div>
  );
}

type ArtifactThumbProps = {
  artifact: ArtifactRecordedEvent;
  onZoom: (artifact: ArtifactRecordedEvent) => void;
  registerCardRef: CardRefRegistrar;
};

/**
 * Small artifact card for the workflow board. SVG artifacts get an
 * inline scaled-down preview; everything else gets a text snippet.
 *
 * @param props - Component props.
 * @param props.artifact - The artifact event to thumbnail.
 * @param props.onZoom - Callback to open the zoom overlay for this artifact.
 * @param props.registerCardRef - Callback to register this card's DOM
 *   node with the board so the lineage-edge overlay can find it by
 *   handle.
 * @returns The rendered card.
 */
function ArtifactThumb({
  artifact,
  onZoom,
  registerCardRef,
}: ArtifactThumbProps): JSX.Element {
  const title = artifact.metadata?.title ?? artifact.handle;
  return (
    <li
      className="phase-column__card"
      ref={(element) => registerCardRef(artifact.handle, element)}
      onClick={() => onZoom(artifact)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onZoom(artifact);
        }
      }}
      aria-label={`Zoom ${title}`}
    >
      <div className="phase-column__thumb">
        {artifact.artifactKind === 'svg' ? (
          <div
            className="phase-column__thumb-svg"
            dangerouslySetInnerHTML={{ __html: artifact.data }}
          />
        ) : (
          <div className="phase-column__thumb-text">
            {artifact.artifactKind}
          </div>
        )}
      </div>
      <div className="phase-column__card-meta">
        <span className="phase-column__card-title">{title}</span>
        <span className="phase-column__card-from">
          from {artifact.fromService}
        </span>
      </div>
    </li>
  );
}

type EdgeSegment = {
  fromHandle: string;
  toHandle: string;
  path: string;
};

type LineageEdgesProps = {
  artifactsByPhase: Map<string, ArtifactRecordedEvent[]>;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  cardRefs: React.MutableRefObject<Map<string, HTMLLIElement>>;
  visible: boolean;
};

/**
 * SVG overlay drawing one cubic-Bezier per `consumes` relationship
 * between artifact cards. The overlay sits absolutely positioned over
 * the columns container, sized to the container's scrollable extent,
 * with `pointer-events: none` so the underlying cards remain
 * interactive.
 *
 * Edges originate at the right-center of the source card and
 * terminate at the left-center of the target card, with an arrowhead
 * marker drawn at the target end. Geometry is recomputed via
 * `useLayoutEffect` on artifact-set changes and via a `ResizeObserver`
 * on container layout changes, so the edges stay anchored when
 * columns wrap, the panel resizes, or the user scrolls horizontally.
 *
 * @param props - Component props.
 * @param props.artifactsByPhase - Per-phase artifact buckets the board
 *   is rendering. Edges are computed by walking every artifact and
 *   looking for `consumes` entries that reference another artifact in
 *   this map.
 * @param props.containerRef - Ref to the `.workflow-board__columns`
 *   container; bounding-rect math is relative to this node.
 * @param props.cardRefs - Ref-managed map from artifact handle to the
 *   `LI` DOM node for that card. Populated by each `ArtifactThumb` as
 *   it mounts/unmounts.
 * @param props.visible - Whether the edges should render. When false
 *   the SVG is still mounted (so geometry stays warm) but its content
 *   is faded out via CSS.
 * @returns The rendered overlay SVG.
 */
function LineageEdges({
  artifactsByPhase,
  containerRef,
  cardRefs,
  visible,
}: LineageEdgesProps): JSX.Element {
  const [edges, setEdges] = useState<EdgeSegment[]>([]);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }
    const containerRect = container.getBoundingClientRect();
    const { scrollLeft, scrollTop, scrollWidth, scrollHeight } = container;
    setContainerSize({ width: scrollWidth, height: scrollHeight });
    const next: EdgeSegment[] = [];
    for (const artifacts of artifactsByPhase.values()) {
      for (const artifact of artifacts) {
        if (artifact.consumes === undefined || artifact.consumes.length === 0) {
          continue;
        }
        const targetEl = cardRefs.current.get(artifact.handle);
        if (targetEl === undefined) {
          continue;
        }
        const targetRect = targetEl.getBoundingClientRect();
        for (const fromHandle of artifact.consumes) {
          const sourceEl = cardRefs.current.get(fromHandle);
          if (sourceEl === undefined) {
            continue;
          }
          const sourceRect = sourceEl.getBoundingClientRect();
          const sourceX = sourceRect.right - containerRect.left + scrollLeft;
          const sourceY =
            sourceRect.top -
            containerRect.top +
            scrollTop +
            sourceRect.height / 2;
          const targetX = targetRect.left - containerRect.left + scrollLeft;
          const targetY =
            targetRect.top -
            containerRect.top +
            scrollTop +
            targetRect.height / 2;
          const controlOffset = Math.max(32, Math.abs(targetX - sourceX) / 2);
          const path =
            `M ${sourceX.toFixed(1)} ${sourceY.toFixed(1)} ` +
            `C ${(sourceX + controlOffset).toFixed(1)} ${sourceY.toFixed(1)}, ` +
            `${(targetX - controlOffset).toFixed(1)} ${targetY.toFixed(1)}, ` +
            `${targetX.toFixed(1)} ${targetY.toFixed(1)}`;
          next.push({
            fromHandle,
            toHandle: artifact.handle,
            path,
          });
        }
      }
    }
    setEdges(next);
  }, [artifactsByPhase, cardRefs, containerRef]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    const observer = new ResizeObserver(() => recompute());
    observer.observe(container);
    for (const cardEl of cardRefs.current.values()) {
      observer.observe(cardEl);
    }
    container.addEventListener('scroll', recompute);
    return () => {
      observer.disconnect();
      container.removeEventListener('scroll', recompute);
    };
  }, [recompute, cardRefs, containerRef]);

  return (
    <svg
      className={`workflow-board__edges${visible ? '' : ' workflow-board__edges--hidden'}`}
      width={containerSize.width}
      height={containerSize.height}
      aria-hidden
    >
      <defs>
        <marker
          id="lineage-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            className="workflow-board__edges-arrow"
          />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={`${edge.fromHandle}->${edge.toHandle}`}
          d={edge.path}
          className="workflow-board__edges-path"
          markerEnd="url(#lineage-arrow)"
        />
      ))}
    </svg>
  );
}
