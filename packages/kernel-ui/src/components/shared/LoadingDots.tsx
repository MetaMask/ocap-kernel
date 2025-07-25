import { useState, useEffect } from 'react';

import styles from '../../App.module.css';

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
    <div className={styles.loading}>
      <span>Loading{dots}</span>
    </div>
  );
};
