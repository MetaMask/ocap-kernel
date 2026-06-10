import { useEffect } from 'react';

import type { ArtifactRecordedEvent } from '../types.ts';
import { ArtifactBody } from './ArtifactPanel.tsx';

type ArtifactZoomProps = {
  artifact: ArtifactRecordedEvent | undefined;
  onClose: () => void;
};

/**
 * Full-viewport overlay showing an artifact at maximum size. Triggered
 * by clicking a workflow-column thumbnail; closes on `Escape` key,
 * backdrop click, or the close-button.
 *
 * @param props - Component props.
 * @param props.artifact - The artifact to display, or `undefined` to
 *   render nothing (the modal is closed).
 * @param props.onClose - Invoked when the user dismisses the modal.
 * @returns The rendered modal, or `null` when closed.
 */
export function ArtifactZoom(props: ArtifactZoomProps): JSX.Element | null {
  const { artifact, onClose } = props;

  useEffect(() => {
    if (artifact === undefined) {
      return undefined;
    }
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [artifact, onClose]);

  if (artifact === undefined) {
    return null;
  }

  const title = artifact.metadata?.title ?? artifact.handle;

  return (
    <div
      className="artifact-zoom"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="artifact-zoom__inner"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="artifact-zoom__header">
          <span className="artifact-zoom__title">{title}</span>
          <button
            className="artifact-zoom__close"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>
        <div className="artifact-zoom__body">
          <ArtifactBody artifact={artifact} />
        </div>
        <footer className="artifact-zoom__footer">
          <span className="artifact-zoom__handle">{artifact.handle}</span>
          <span className="artifact-zoom__from">
            from {artifact.fromService}
          </span>
        </footer>
      </div>
    </div>
  );
}
