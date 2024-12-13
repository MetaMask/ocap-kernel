// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './panel/App.js';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const root = createRoot(document.getElementById('root')!);
root.render(<App />);

export default App;
