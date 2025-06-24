import '@metamask/kernel-ui/styles.css';
import { App } from '@metamask/kernel-ui';
import { createRoot } from 'react-dom/client';

// @ts-expect-error - our root element is not null
const root = createRoot(document.getElementById('root'));
root.render(<App />);
