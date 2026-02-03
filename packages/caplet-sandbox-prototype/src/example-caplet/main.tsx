import { App } from './App.tsx';
import { bootstrapCaplet } from '../caplet/bootstrap.tsx';

// eslint-disable-next-line no-console
bootstrapCaplet(App).catch(console.error);
