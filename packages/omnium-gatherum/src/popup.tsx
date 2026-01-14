import '@metamask/kernel-ui/styles.css';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App.tsx';

createRoot(document.getElementById('root') as HTMLElement).render(
  createElement(App),
);
