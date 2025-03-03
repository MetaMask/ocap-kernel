import { createRoot } from 'react-dom/client';

import { App } from './ui/App.tsx';

// @ts-expect-error - our root element is not null
const root = createRoot(document.getElementById('root'));
root.render(<App />);
