import { useEffect, useRef } from 'preact/hooks';

type SlotProps = {
  widgetId: string;
  widgetUrl: string;
  style?: preact.JSX.CSSProperties;
};

/**
 * Slot component for embedding caplet-backed widgets.
 * Creates a nested sandboxed iframe that communicates with window.top.
 *
 * @param props - Slot properties.
 * @param props.widgetId - Unique identifier for the widget caplet.
 * @param props.widgetUrl - URL of the widget iframe content.
 * @param props.style - Optional CSS styles for the container.
 * @returns Slot container element.
 */
export function Slot({
  widgetId,
  widgetUrl,
  style,
}: SlotProps): preact.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const iframe = document.createElement('iframe');
    iframe.sandbox.add('allow-scripts');
    iframe.sandbox.add('allow-same-origin'); // Required for dev server
    iframe.src = `${widgetUrl}?capletId=${encodeURIComponent(widgetId)}`;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';

    containerRef.current.appendChild(iframe);

    return () => {
      iframe.remove();
    };
  }, [widgetId, widgetUrl]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: '100px',
        ...style,
      }}
    />
  );
}
