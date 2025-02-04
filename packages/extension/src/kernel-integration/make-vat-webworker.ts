import { getUrlParam } from '@ocap/utils';

const vatId = getUrlParam('vatId');

const worker = new Worker(`vat-worker.js?vatId=${vatId}`, { type: 'module' });

window.addEventListener('message', (event) => {
  worker.postMessage(event.data);
});

worker.addEventListener('message', (event) => {
  window.parent.postMessage(event.data, '*');
});
