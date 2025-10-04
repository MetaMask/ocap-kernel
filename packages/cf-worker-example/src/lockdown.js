/* global lockdown */
import 'ses';
import '@endo/eventual-send/shim.js';

try {
  lockdown({
    consoleTaming: 'unsafe',
    errorTaming: 'unsafe',
    overrideTaming: 'severe',
    domainTaming: 'unsafe',
    stackFiltering: 'concise',
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('SES lockdown failed (example):', err);
  throw err;
}
