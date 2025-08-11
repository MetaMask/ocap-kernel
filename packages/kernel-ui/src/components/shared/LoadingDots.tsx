import { Box } from '@metamask/design-system-react';
import { useState, useEffect } from 'react';

/**
 * @returns A component that displays a loading animation with dots.
 */
export const LoadingDots: React.FC = () => {
  const [dots, setDots] = useState('.');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '.' : `${prev}.`));
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box>
      <span>Loading{dots}</span>
    </Box>
  );
};
