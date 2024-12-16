import { createRoot } from 'react-dom/client';

import { App } from './panel/App.jsx';

// @ts-expect-error - our root element is not null
const root = createRoot(document.getElementById('root'));
root.render(<App />);
