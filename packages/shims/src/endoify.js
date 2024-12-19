import 'ses';
import '@endo/eventual-send/shim.js';

lockdown({
  consoleTaming: 'unsafe',
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  domainTaming: 'unsafe',
  overrideTaming: 'severe',
});
