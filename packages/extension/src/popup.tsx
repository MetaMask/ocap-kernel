import '@metamask/kernel-ui/styles.css';
import { App } from '@metamask/kernel-ui';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root') as HTMLElement).render(
  createElement(App),
);
