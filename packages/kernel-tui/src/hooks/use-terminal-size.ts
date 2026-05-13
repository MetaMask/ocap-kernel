import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

/**
 * Returns the current terminal dimensions and re-renders whenever the terminal
 * is resized.
 *
 * @returns An object with `columns` and `rows` reflecting the live terminal size.
 */
export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns,
    rows: stdout.rows,
  });

  useEffect(() => {
    const onResize = (): void => {
      setSize({ columns: stdout.columns, rows: stdout.rows });
    };
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}
